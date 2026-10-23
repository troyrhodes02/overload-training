import "server-only";
import { toIsoDate, todayIso } from "@/lib/plan/calendar";
import type { AdminOverviewDto } from "@/lib/admin/types";
import { computeOverview } from "@/lib/admin/overview";
import { adminDb } from "./db";
import { assertAdmin, type AdminActor } from "./identity";

/**
 * THE ADMIN METRICS LAYER (Admin Center & Feedback, spec §9; R12–R14). It
 * returns numbers only. Its inputs are account metadata (signup instant,
 * timezone, status, last-active date) and, for the two adoption counts, only
 * the SET of account ids that have at least one Mesocycle or one LoggedSet —
 * the gate refuses any other question to those tables, so no plan, set,
 * weight, or exercise can reach this module, let alone its result.
 */

/** The Overview for the acting admin (their timezone is "today"). */
export async function getAdminOverview(
  actor: AdminActor,
  now: Date = new Date(),
): Promise<AdminOverviewDto> {
  assertAdmin(actor);
  const db = adminDb();
  const [profiles, plans, logged] = await Promise.all([
    db.profile.findMany({
      select: {
        userId: true,
        createdAt: true,
        timeZone: true,
        status: true,
        lastActiveOn: true,
      },
    }),
    db.mesocycle.groupBy({ by: ["userId"] }),
    db.loggedSet.groupBy({ by: ["userId"] }),
  ]);
  return computeOverview({
    profiles: profiles.map((p) => ({
      id: p.userId,
      createdAt: p.createdAt,
      timeZone: p.timeZone,
      status: p.status,
      lastActiveOn: p.lastActiveOn ? toIsoDate(p.lastActiveOn) : null,
    })),
    withPlan: new Set(plans.map((r) => r.userId)),
    loggedWorkout: new Set(logged.map((r) => r.userId)),
    today: todayIso(actor.timeZone, now),
    timeZone: actor.timeZone,
  });
}
