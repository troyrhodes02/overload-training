import "server-only";
import type { Account } from "@/lib/data/account";
import { accountToday } from "@/lib/data/account";
import {
  addDays,
  formatPlanDate,
  formatPlanRange,
  mesocycleWeekForDate,
} from "@overload/shared/plan/calendar";
import { formatRepTarget } from "@overload/shared/plan/rep-target";
import {
  effectiveWeekSchedule,
  oldestUnresolvedMissedDay,
  type EffectiveOccurrence,
} from "@overload/shared/logging/schedule";
import { isScheduledDeloadWeek } from "@overload/shared/progression/deload";
import { activeContext } from "./queries";
import { isUuid } from "@/lib/actions/result";
import { parseIsoDate, toIsoDate } from "@overload/shared/plan/calendar";

/**
 * The current block week for Today's week strip (OVE-240), web only. Read
 * only, through the account-scoped client: the same effective schedule Today,
 * History, and the iPhone read, so the strip can't disagree with them. Each
 * day says what sits on it this week and which of this week's adjustments
 * (skip, train today, swap) its workout allows; the write path
 * (schedule-adjustments.ts) re-checks every rule under the block's lock.
 */

export type ThisWeekWorkoutState =
  "upcoming" | "in_progress" | "complete" | "skipped";

export type ThisWeekWorkout = {
  sessionId: string;
  /** The occurrence's identity: its authored date (LoggedSession.scheduledFor). */
  scheduledFor: string;
  sessionName: string;
  state: ThisWeekWorkoutState;
  loggedSessionId: string | null;
  /** Its planned day, when this week moved it ("Planned for Wed, Nov 25"). */
  movedFrom: string | null;
  /** Today or later, nothing started, no resolution: it can be skipped or moved. */
  adjustable: boolean;
  exercises: { name: string; scheme: string }[];
};

export type ThisWeekDay = {
  dateIso: string;
  /** "Mon" */
  weekday: string;
  /** "24" */
  dayOfMonth: string;
  /** "Mon, Nov 24" */
  dayLabel: string;
  isToday: boolean;
  isPast: boolean;
  /** The workout on this day this week (never a skipped one), or null for rest. */
  workout: ThisWeekWorkout | null;
  /** Workouts skipped on this day this week. */
  skipped: ThisWeekWorkout[];
};

export type ThisWeekDto = {
  mesocycleId: string;
  weekNumber: number;
  lengthWeeks: number;
  rangeLabel: string;
  scheduledDeloadWeek: boolean;
  today: string;
  days: ThisWeekDay[];
  /** Why nothing can move right now (a missed day waits for an answer), or null. */
  blockedReason: string | null;
};

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});

function stateOf(o: EffectiveOccurrence): ThisWeekWorkoutState {
  if (o.resolution === "skipped") return "skipped";
  if (o.loggedStatus === "complete") return "complete";
  if (o.loggedStatus === "in_progress") return "in_progress";
  return "upcoming";
}

/** The current block week, or null with no active block or outside it. */
export async function getThisWeek(
  account: Account,
): Promise<ThisWeekDto | null> {
  const active = await activeContext(account);
  if (!active) return null;
  const today = accountToday(account);
  const week = mesocycleWeekForDate(active.startDate, today);
  if (week === null || week < 1 || week > active.lengthWeeks) return null;

  const weekStart = addDays(active.startDate, (week - 1) * 7);
  const weekEnd = addDays(weekStart, 6);
  const occurrences = effectiveWeekSchedule(active.ctx, week);
  const blockedReason = oldestUnresolvedMissedDay(active.ctx, today)
    ? "Answer the missed workout first, then you can change this week."
    : null;

  const sessionIds = [...new Set(occurrences.map((o) => o.sessionId))];
  const [slots, logged] = await Promise.all([
    account.db.sessionExercise.findMany({
      where: { sessionId: { in: sessionIds } },
      orderBy: { position: "asc" },
      select: {
        sessionId: true,
        plannedSets: true,
        targetRepMin: true,
        targetRepMax: true,
        exercise: { select: { name: true } },
      },
    }),
    account.db.loggedSession.findMany({
      where: {
        mesocycleId: active.mesocycleId,
        scheduledFor: {
          gte: new Date(`${weekStart}T00:00:00.000Z`),
          lte: new Date(`${weekEnd}T00:00:00.000Z`),
        },
      },
      select: { id: true, sessionId: true, scheduledFor: true },
    }),
  ]);
  const loggedId = new Map(
    logged.map((l) => [
      `${l.sessionId}|${l.scheduledFor.toISOString().slice(0, 10)}`,
      l.id,
    ]),
  );

  const toWorkout = (o: EffectiveOccurrence): ThisWeekWorkout => {
    const state = stateOf(o);
    const day = o.effectiveIso ?? o.authoredIso;
    return {
      sessionId: o.sessionId,
      scheduledFor: o.authoredIso,
      sessionName: o.sessionName,
      state,
      loggedSessionId: loggedId.get(`${o.sessionId}|${o.authoredIso}`) ?? null,
      movedFrom: day !== o.authoredIso ? o.authoredIso : null,
      adjustable:
        state === "upcoming" &&
        o.resolution === null &&
        !o.dropped &&
        o.effectiveIso !== null &&
        o.effectiveIso >= today,
      exercises: slots
        .filter((s) => s.sessionId === o.sessionId)
        .map((s) => ({
          name: s.exercise.name,
          scheme: `${s.plannedSets} × ${formatRepTarget(s.targetRepMin, s.targetRepMax)}`,
        })),
    };
  };

  const days: ThisWeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const dateIso = addDays(weekStart, i);
    const here = occurrences.filter(
      (o) => !o.dropped && (o.effectiveIso ?? o.authoredIso) === dateIso,
    );
    const live = here.find((o) => o.resolution !== "skipped") ?? null;
    return {
      dateIso,
      weekday: WEEKDAY_FMT.format(new Date(`${dateIso}T00:00:00.000Z`)),
      dayOfMonth: String(Number(dateIso.slice(8, 10))),
      dayLabel: formatPlanDate(dateIso),
      isToday: dateIso === today,
      isPast: dateIso < today,
      workout: live ? toWorkout(live) : null,
      skipped: here.filter((o) => o.resolution === "skipped").map(toWorkout),
    };
  });

  return {
    mesocycleId: active.mesocycleId,
    weekNumber: week,
    lengthWeeks: active.lengthWeeks,
    rangeLabel: formatPlanRange(weekStart, weekEnd),
    scheduledDeloadWeek: isScheduledDeloadWeek(week, active.deloadEveryWeeks),
    today,
    days,
    blockedReason,
  };
}

/**
 * The day an occurrence was moved to this week (OVE-240), or null if it
 * wasn't moved. For wording only (the start page names the day it starts).
 */
export async function movedDayOf(
  account: Account,
  sessionId: string,
  scheduledFor: string,
): Promise<string | null> {
  const authoredOn = parseIsoDate(scheduledFor);
  if (!authoredOn || !isUuid(sessionId)) return null;
  const move = await account.db.scheduleMove.findUnique({
    where: { sessionId_authoredOn: { sessionId, authoredOn } },
    select: { movedTo: true },
  });
  return move ? toIsoDate(move.movedTo) : null;
}
