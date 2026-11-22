import "server-only";
import type { Account } from "@/lib/data/account";
import { getPlanOverview, getPlanSession } from "@/lib/views/plan";
import type {
  PlanOverviewDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";
import { ApiFailure } from "./errors";

/**
 * Plans, Library & Gyms's mobile adapters (Pitch 21h spec §6). Like the
 * Workout Loop's and Logging Completeness's, each is a thin shell over the
 * module the web uses, unchanged: the account is the verified token's, every
 * read and write runs on its scoped client, and every rule stays in that
 * module. The adapters only check a request's SHAPE. Nothing here is Pro: no
 * progression reader is called.
 */

/** Bodies of the resource writes are a few short fields. */
export const RESOURCE_BODY_LIMIT = 4 * 1024;

/** `?week=` as a positive whole number, or undefined (today's week). */
export function parseWeekParam(raw: string | null): number | undefined {
  if (raw === null || !/^\d{1,3}$/.test(raw)) return undefined;
  const n = Number(raw);
  return n >= 1 ? n : undefined;
}

/** E1 `GET /plan?week=n`: the active block and one of its weeks. */
export function readPlan(
  account: Account,
  week: string | null,
): Promise<PlanOverviewDto> {
  return getPlanOverview(account, parseWeekParam(week));
}

/** E2 `GET /mesocycles/{mesocycleId}/sessions/{sessionId}`: one authored session. */
export async function readPlanSession(
  account: Account,
  mesocycleId: string,
  sessionId: string,
): Promise<PlanSessionDto> {
  const session = await getPlanSession(account, mesocycleId, sessionId);
  if (!session) {
    throw new ApiFailure("not_found", "That session isn't in your plan.");
  }
  return session;
}
