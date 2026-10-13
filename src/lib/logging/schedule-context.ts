import "server-only";
import type { Prisma } from "@prisma/client";
import { toIsoDate } from "@/lib/plan/calendar";
import type { ScheduleContext } from "./schedule";

/**
 * Loads the inputs of the effective schedule (Guided Workout Logging, spec
 * §11) for one mesocycle: its scheduled sessions, its dated missed-day
 * resolutions, and its logged-session occurrences. The ONE place a
 * ScheduleContext is assembled, so the dashboard, history, and Cardio Logging
 * (which consumes the effective schedule, never produces it) can't disagree.
 * Read-only; works with the app client or inside a caller's transaction.
 */
type Db = Prisma.TransactionClient;

export async function loadScheduleContext(
  db: Db,
  meso: {
    id: string;
    startDate: Date;
    lengthWeeks: number;
    sessions: { id: string; name: string; dayOfWeek: number | null }[];
  },
): Promise<ScheduleContext> {
  const [resolutions, loggedSessions] = await Promise.all([
    db.missedDayResolution.findMany({ where: { mesocycleId: meso.id } }),
    db.loggedSession.findMany({ where: { mesocycleId: meso.id } }),
  ]);
  return {
    startDate: toIsoDate(meso.startDate),
    lengthWeeks: meso.lengthWeeks,
    sessions: meso.sessions
      .filter((s) => s.dayOfWeek !== null)
      .map((s) => ({
        id: s.id,
        name: s.name,
        dayOfWeek: s.dayOfWeek as number,
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
