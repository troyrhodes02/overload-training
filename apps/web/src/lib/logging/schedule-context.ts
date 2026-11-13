import "server-only";
import type { AccountDb } from "@/lib/data/account-db";
import { isoDateInZone, toIsoDate } from "@/lib/plan/calendar";
import type { ScheduleContext } from "./schedule";

/**
 * Loads the inputs of the effective schedule (Guided Workout Logging, spec
 * §11) for one mesocycle: its scheduled sessions, its dated missed-day
 * resolutions, and its logged-session occurrences. The ONE place a
 * ScheduleContext is assembled, so the dashboard, history, and Cardio Logging
 * (which consumes the effective schedule, never produces it) can't disagree.
 * Read-only; works with the account-scoped client or inside a caller's
 * (scoped) transaction, so only the acting account's records are loaded.
 */
type Db = AccountDb;

/**
 * When a session's occurrences start to count (OVE follow-up to F-T5). A
 * session ADDED to a block after the block had started counts only from the
 * day it was created, in the account's timezone, so adding one mid-block never
 * turns past weeks into missed days. "Added later" is read from existing
 * timestamps — no stored activation time or new column: the session was
 * created on a later day than its block, and after the block's start date.
 * A block built (and backdated) in one sitting keeps every occurrence.
 */
export function sessionCountsFrom(
  session: { createdAt?: Date },
  meso: { createdAt?: Date; startDate: string },
  timeZone: string | undefined,
): string | null {
  if (!session.createdAt || !meso.createdAt || !timeZone) return null;
  const created = isoDateInZone(session.createdAt, timeZone);
  const blockCreated = isoDateInZone(meso.createdAt, timeZone);
  return created > blockCreated && created > meso.startDate ? created : null;
}

export async function loadScheduleContext(
  db: Db,
  meso: {
    id: string;
    startDate: Date;
    lengthWeeks: number;
    createdAt?: Date;
    sessions: {
      id: string;
      name: string;
      dayOfWeek: number | null;
      createdAt?: Date;
    }[];
  },
  timeZone?: string,
): Promise<ScheduleContext> {
  const startIso = toIsoDate(meso.startDate);
  const [resolutions, loggedSessions] = await Promise.all([
    db.missedDayResolution.findMany({ where: { mesocycleId: meso.id } }),
    db.loggedSession.findMany({ where: { mesocycleId: meso.id } }),
  ]);
  return {
    startDate: startIso,
    lengthWeeks: meso.lengthWeeks,
    sessions: meso.sessions
      .filter((s) => s.dayOfWeek !== null)
      .map((s) => ({
        id: s.id,
        name: s.name,
        dayOfWeek: s.dayOfWeek as number,
        countsFrom: sessionCountsFrom(
          s,
          { createdAt: meso.createdAt, startDate: startIso },
          timeZone,
        ),
      })),
    resolutions: resolutions.map((r) => ({
      missedOn: toIsoDate(r.missedOn),
      outcome: r.outcome,
    })),
    loggedSessions: loggedSessions
      .filter((l) => l.sessionId !== null)
      .map((l) => ({
        sessionId: l.sessionId as string,
        scheduledFor: toIsoDate(l.scheduledFor),
        status: l.status,
      })),
  };
}
