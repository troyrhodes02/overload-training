import "server-only";
import { DomainError, isUuid } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import {
  mesocycleWeekForDate,
  parseIsoDate,
  todayIso,
  toIsoDate,
} from "@overload/shared/plan/calendar";
import { effectiveWeekSchedule } from "@overload/shared/logging/schedule";
import { loadScheduleContext } from "./schedule-context";

/**
 * Missed-day resolution (Resolved Decisions 30–39). A resolution is a dated
 * historical fact: one per missed planned day, immutable in Pitch 4. The
 * effective schedule is derived from the Mesocycle plus these records; the
 * authored Session template is never mutated here.
 */

type Db = AccountTx;

/** The outcomes this write path records ("log it late" starts a workout). */
export const RESOLVABLE_OUTCOMES = ["shifted", "skipped"] as const;
export type ResolvableOutcome = (typeof RESOLVABLE_OUTCOMES)[number];

function isResolvableOutcome(v: unknown): v is ResolvableOutcome {
  return (RESOLVABLE_OUTCOMES as readonly unknown[]).includes(v);
}

export type MissedDayResolutionDto = {
  id: string;
  missedOn: string;
  outcome: ResolvableOutcome;
};

/**
 * Resolve a genuinely missed planned day as shifted or skipped (OVE-132 /
 * audit F-T4). The day must be an occurrence of the ACTIVE block's schedule
 * that is in the past (in the account's timezone), not logged (no workout,
 * even an in-progress one), not dropped by an earlier shift, and not already
 * resolved — exactly what the missed-day prompt offers. Anything else is a
 * validation_error. The outcome is checked at runtime.
 *
 * Retry-safe: replaying the same outcome for the same day returns the
 * existing resolution; a different outcome is a conflict (a resolution is an
 * immutable historical fact, Decision 33).
 */
export async function resolveMissedDay(
  account: Account,
  input: { mesocycleId: string; missedOn: string; outcome: unknown },
  tx?: Db,
): Promise<MissedDayResolutionDto> {
  if (!tx)
    return account.db.$transaction((t) => resolveMissedDay(account, input, t));

  if (!isResolvableOutcome(input.outcome)) {
    throw new DomainError("validation_error", "Choose shift or skip.");
  }
  const outcome = input.outcome;
  const date = parseIsoDate(input.missedOn);
  if (!date) throw new DomainError("validation_error", "Invalid date.");
  const missedOn = toIsoDate(date);
  // The mesocycle must be the acting account's: another account's (or a
  // missing) one is "not found" — never a resolution pointing at it.
  const meso = isUuid(input.mesocycleId)
    ? await tx.mesocycle.findUnique({
        where: { id: input.mesocycleId },
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
      })
    : null;
  if (!meso)
    throw new DomainError("not_found", "That mesocycle doesn't exist.");

  const existing = await tx.missedDayResolution.findUnique({
    where: {
      mesocycleId_missedOn: { mesocycleId: meso.id, missedOn: date },
    },
    select: { id: true, outcome: true },
  });
  if (existing) {
    // Same answer again (a retry after a timeout): the resolution stands.
    if (existing.outcome === outcome) {
      return { id: existing.id, missedOn, outcome };
    }
    // Immutable: a confirmed resolution is historical fact (Decision 33).
    throw new DomainError("conflict", "That day is already resolved.");
  }

  const notMissed = () =>
    new DomainError(
      "validation_error",
      "That day isn't a missed workout you can resolve.",
    );
  if (meso.status !== "active" || !meso.startDate) throw notMissed();
  const ctx = await loadScheduleContext(
    tx,
    { ...meso, startDate: meso.startDate },
    account.timeZone,
  );
  const week = mesocycleWeekForDate(ctx.startDate, missedOn);
  if (week === null || week < 1 || week > ctx.lengthWeeks) throw notMissed();
  const occurrence = effectiveWeekSchedule(ctx, week).find(
    (o) => o.authoredIso === missedOn,
  );
  if (
    !occurrence ||
    occurrence.resolution !== null ||
    occurrence.dropped ||
    occurrence.effectiveIso === null ||
    occurrence.loggedStatus !== null ||
    occurrence.effectiveIso >= todayIso(account.timeZone)
  ) {
    throw notMissed();
  }

  const created = await tx.missedDayResolution.create({
    data: {
      userId: account.userId,
      mesocycleId: meso.id,
      sessionId: occurrence.sessionId,
      missedOn: date,
      outcome,
    },
    select: { id: true },
  });
  return { id: created.id, missedOn, outcome };
}
