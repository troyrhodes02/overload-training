import "server-only";
import { DomainError, isUuid } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import { lockMesocycleForUpdate } from "@/lib/data/locks";
import {
  addDays,
  mesocycleWeekForDate,
  parseIsoDate,
  todayIso,
  toIsoDate,
} from "@overload/shared/plan/calendar";
import {
  effectiveWeekSchedule,
  oldestUnresolvedMissedDay,
  type EffectiveOccurrence,
  type ScheduleContext,
} from "@overload/shared/logging/schedule";
import { loadScheduleContext } from "./schedule-context";

/**
 * This week's schedule adjustments on Today (OVE-240): skip a workout before
 * its day, train a later workout today, or swap two days. The ONE write path
 * for a ScheduleMove, and the path that records a skip ahead of time.
 *
 * Three dates stay distinct. The authored weekday (Session.dayOfWeek) is
 * never written here, so next week keeps its normal schedule. The effective
 * date this week comes from the effective schedule (shifts, skips, and these
 * moves). The day a workout is trained is the LoggedSession's performedOn,
 * written by the start path. An occurrence keeps its identity (sessionId plus
 * its authored date, the LoggedSession's scheduledFor) wherever it moves, so
 * it is accounted for exactly once.
 *
 * Only the current block week changes, and only workouts that sit today or
 * later, have no workout started, and have no resolution. While a missed day
 * waits for an answer, nothing moves: the missed-day prompt comes first.
 *
 * Every write takes the block's row lock first, so two tabs (or a start and a
 * move) run one after the other. Requests say what the lifter saw: a replay
 * of a change already made answers success and writes nothing, and a request
 * built on a stale week is a conflict. Nothing toggles.
 */

type Db = AccountTx;

/** An occurrence by identity: its session and authored date. */
export type OccurrenceRef = { sessionId: string; scheduledFor: string };

type AdjustableWeek = {
  /**
   * The database's transaction time: a move is dated on the same clock as a
   * missed-day resolution's createdAt, so the week replays them in order.
   */
  at: Date;
  ctx: ScheduleContext;
  occurrences: EffectiveOccurrence[];
  today: string;
  weekEnd: string;
};

const STALE = "Your week changed. Reload to see it, then try again.";

async function loadAdjustableWeek(
  account: Account,
  tx: Db,
  mesocycleId: string,
): Promise<AdjustableWeek> {
  // Another account's (or a missing) block is not found, never forbidden.
  const locked = isUuid(mesocycleId)
    ? await lockMesocycleForUpdate(account, tx, mesocycleId)
    : null;
  if (!locked) throw new DomainError("not_found", "That plan doesn't exist.");
  const meso = await tx.mesocycle.findUnique({
    where: { id: mesocycleId },
    select: {
      id: true,
      status: true,
      startDate: true,
      lengthWeeks: true,
      createdAt: true,
      sessions: {
        select: { id: true, name: true, dayOfWeek: true, createdAt: true },
      },
    },
  });
  if (!meso) throw new DomainError("not_found", "That plan doesn't exist.");
  if (meso.status !== "active" || !meso.startDate) {
    throw new DomainError(
      "invalid_state_transition",
      "Only your active plan's week can be changed.",
    );
  }
  const ctx = await loadScheduleContext(
    tx,
    { ...meso, startDate: meso.startDate },
    account.timeZone,
  );
  const today = todayIso(account.timeZone);
  const week = mesocycleWeekForDate(ctx.startDate, today);
  if (week === null || week < 1 || week > ctx.lengthWeeks) {
    throw new DomainError(
      "invalid_state_transition",
      "There's no training week to change today.",
    );
  }
  const weekStart = addDays(ctx.startDate, (week - 1) * 7);
  return {
    at: locked.lockedAt,
    ctx,
    occurrences: effectiveWeekSchedule(ctx, week),
    today,
    weekEnd: addDays(weekStart, 6),
  };
}

function findOccurrence(
  week: AdjustableWeek,
  ref: OccurrenceRef,
): EffectiveOccurrence {
  const o = isUuid(ref.sessionId)
    ? week.occurrences.find(
        (x) =>
          x.sessionId === ref.sessionId && x.authoredIso === ref.scheduledFor,
      )
    : undefined;
  if (!o) {
    throw new DomainError("not_found", "That workout isn't in this week.");
  }
  return o;
}

/** A workout that still sits on a day, today or later, untouched. */
function assertAdjustable(o: EffectiveOccurrence, today: string): void {
  if (o.loggedStatus === "complete") {
    throw new DomainError(
      "invalid_state_transition",
      `${o.sessionName} is finished, so it stays on its day.`,
    );
  }
  if (o.loggedStatus === "in_progress") {
    throw new DomainError(
      "invalid_state_transition",
      `${o.sessionName} has started, so it stays on its day.`,
    );
  }
  if (o.resolution === "skipped") {
    throw new DomainError(
      "invalid_state_transition",
      `${o.sessionName} is skipped this week.`,
    );
  }
  if (o.resolution !== null || o.dropped || o.effectiveIso === null) {
    throw new DomainError(
      "invalid_state_transition",
      `${o.sessionName} can't be changed this week.`,
    );
  }
  if (o.effectiveIso < today) {
    throw new DomainError(
      "invalid_state_transition",
      `${o.sessionName}'s day has passed.`,
    );
  }
}

function assertNoMissedDay(week: AdjustableWeek): void {
  if (oldestUnresolvedMissedDay(week.ctx, week.today)) {
    throw new DomainError(
      "invalid_state_transition",
      "Answer the missed workout on Today first.",
    );
  }
}

/** A day of this week, today or later. */
function upcomingDay(value: unknown, week: AdjustableWeek): string {
  const date = typeof value === "string" ? parseIsoDate(value) : null;
  if (!date) throw new DomainError("validation_error", "Invalid date.");
  const iso = toIsoDate(date);
  if (iso < week.today) {
    throw new DomainError("conflict", STALE);
  }
  if (iso > week.weekEnd) {
    throw new DomainError(
      "validation_error",
      "Choose a day in this training week.",
    );
  }
  return iso;
}

/** The workout that sits on `day` now (a skipped one leaves the day free). */
function occupantOf(
  week: AdjustableWeek,
  day: string,
  except: EffectiveOccurrence,
): EffectiveOccurrence | null {
  return (
    week.occurrences.find(
      (o) =>
        o !== except &&
        o.effectiveIso === day &&
        o.resolution !== "skipped" &&
        !o.dropped,
    ) ?? null
  );
}

const sameRef = (o: EffectiveOccurrence | null, ref: OccurrenceRef | null) =>
  o === null || ref === null
    ? o === null && ref === null
    : o.sessionId === ref.sessionId && o.authoredIso === ref.scheduledFor;

/**
 * Skip a workout before (or on) its day. Recorded as the existing skipped
 * resolution for that occurrence, so the missed-day prompt never asks about
 * it, Today and History show it skipped, and next week is untouched. A
 * finished or started workout is never skipped, and no set is touched.
 * Replaying the same skip answers success; another outcome is a conflict.
 */
export async function skipUpcomingWorkout(
  account: Account,
  input: { mesocycleId: string } & OccurrenceRef,
  tx?: Db,
): Promise<{ missedOn: string; outcome: "skipped" }> {
  if (!tx) {
    return account.db.$transaction((t) =>
      skipUpcomingWorkout(account, input, t),
    );
  }
  const week = await loadAdjustableWeek(account, tx, input.mesocycleId);
  const o = findOccurrence(week, input);
  if (o.resolution === "skipped") {
    return { missedOn: o.authoredIso, outcome: "skipped" };
  }
  assertAdjustable(o, week.today);
  await tx.missedDayResolution.create({
    data: {
      userId: account.userId,
      mesocycleId: input.mesocycleId,
      sessionId: o.sessionId,
      missedOn: new Date(`${o.authoredIso}T00:00:00.000Z`),
      outcome: "skipped",
    },
    select: { id: true },
  });
  return { missedOn: o.authoredIso, outcome: "skipped" };
}

/**
 * Move one workout to another day of this week ("Train today", or a swap
 * with a rest day), or swap it with the workout on that day ("Swap days").
 *
 * `from` and `occupant` say what the lifter saw: the workout on `from`, and
 * the workout on `to` (null for a free day). If the week no longer looks like
 * that, nothing is written and the answer is a conflict. If the change is
 * already in place (a retry), nothing is written and the answer is
 * "unchanged". Both workouts must sit today or later, with nothing started.
 */
export async function rescheduleWorkout(
  account: Account,
  input: {
    mesocycleId: string;
    sessionId: string;
    scheduledFor: string;
    from: string;
    to: string;
    occupant: OccurrenceRef | null;
  },
  tx?: Db,
): Promise<{ status: "moved" | "unchanged" }> {
  if (!tx) {
    return account.db.$transaction((t) => rescheduleWorkout(account, input, t));
  }
  const week = await loadAdjustableWeek(account, tx, input.mesocycleId);
  const moving = findOccurrence(week, input);
  const occupant = input.occupant ?? null;
  if (
    occupant !== null &&
    (typeof occupant !== "object" ||
      typeof occupant.sessionId !== "string" ||
      typeof occupant.scheduledFor !== "string")
  ) {
    throw new DomainError("validation_error", "Invalid workout.");
  }

  // A retry of a change already made: the workout is on `to`, and the one
  // it swapped with (if any) is on `from`.
  if (moving.effectiveIso === input.to) {
    const partner = occupant ? findOccurrence(week, occupant) : null;
    const done = partner
      ? partner.effectiveIso === input.from
      : occupantOf(week, input.to, moving) === null;
    if (done) return { status: "unchanged" };
    throw new DomainError("conflict", STALE);
  }

  const from = upcomingDay(input.from, week);
  const to = upcomingDay(input.to, week);
  if (from === to) {
    throw new DomainError("validation_error", "Choose a different day.");
  }
  if (moving.effectiveIso !== from) throw new DomainError("conflict", STALE);
  const current = occupantOf(week, to, moving);
  if (!sameRef(current, occupant)) throw new DomainError("conflict", STALE);

  assertNoMissedDay(week);
  assertAdjustable(moving, week.today);
  if (current) assertAdjustable(current, week.today);

  await placeOccurrence(account, tx, input.mesocycleId, moving, to, week.at);
  if (current) {
    await placeOccurrence(
      account,
      tx,
      input.mesocycleId,
      current,
      from,
      week.at,
    );
  }
  return { status: "moved" };
}

/** Record (or update) where an occurrence sits this week. */
async function placeOccurrence(
  account: Account,
  tx: Db,
  mesocycleId: string,
  o: EffectiveOccurrence,
  day: string,
  at: Date,
): Promise<void> {
  const authoredOn = new Date(`${o.authoredIso}T00:00:00.000Z`);
  const movedTo = new Date(`${day}T00:00:00.000Z`);
  await tx.scheduleMove.upsert({
    where: {
      sessionId_authoredOn: { sessionId: o.sessionId, authoredOn },
    },
    create: {
      userId: account.userId,
      mesocycleId,
      sessionId: o.sessionId,
      authoredOn,
      movedTo,
      createdAt: at,
      updatedAt: at,
    },
    update: { movedTo, updatedAt: at },
    select: { id: true },
  });
}
