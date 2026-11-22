import "server-only";
import type { Account } from "@/lib/data/account";
import { getPlanOverview, getPlanSession } from "@/lib/views/plan";
import { getExercise, listExercises } from "@/lib/exercises/queries";
import { parseLibraryParams } from "@/lib/exercises/library-params";
import type {
  ExerciseDetailDto,
  ExerciseList,
} from "@overload/shared/contracts/exercises";
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

/**
 * E3 `GET /exercises?view=&muscle=&q=&limit=`: the library with the web's
 * own filters (every search word, All or Favorites, primary muscle) and page
 * limit, read tolerantly by the web's parser: an unknown value is the default.
 */
export function readExercises(
  account: Account,
  params: URLSearchParams,
): Promise<ExerciseList> {
  const filters = parseLibraryParams({
    view: params.get("view") ?? undefined,
    muscle: params.get("muscle") ?? undefined,
    q: params.get("q") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });
  return listExercises(account, filters);
}

/**
 * E4 `GET /exercises/{exerciseId}`: a library exercise or one of the
 * account's own, archived ones included (history and plans name them).
 * Another account's custom exercise is a 404 like a missing one.
 */
export async function readExercise(
  account: Account,
  exerciseId: string,
): Promise<ExerciseDetailDto> {
  const exercise = await getExercise(account, exerciseId);
  if (!exercise)
    throw new ApiFailure("not_found", "That exercise doesn't exist.");
  return exercise;
}
