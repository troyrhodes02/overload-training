import "server-only";
import type { Account } from "@/lib/data/account";
import { getPlanOverview, getPlanSession } from "@/lib/views/plan";
import {
  getExercise,
  listExercises,
  toExerciseDetail,
} from "@/lib/exercises/queries";
import {
  archiveExercise,
  createCustomExercise,
  restoreExercise,
  setExerciseFavorite,
} from "@/lib/exercises/exercises";
import type {
  SetArchivedResponseDto,
  SetFavoriteResponseDto,
} from "@overload/shared/contracts/exercises";
import { archiveGym, createGym, restoreGym } from "@/lib/gyms/gyms";
import { readJsonObject } from "./body";
import {
  IDEMPOTENCY_HEADER,
  parseIdempotencyKey,
  withIdempotency,
} from "./idempotency";
import { parseLibraryParams } from "@/lib/exercises/library-params";
import type {
  ExerciseDetailDto,
  ExerciseList,
} from "@overload/shared/contracts/exercises";
import type {
  PlanOverviewDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";
import { ApiFailure, shapeError } from "./errors";

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

/**
 * `?week=` as a whole number (the schedule read clamps it into the block:
 * 0 is week 1, a large one the last week), or undefined — today's week — for
 * anything else (review #5; spec E1).
 */
export function parseWeekParam(raw: string | null): number | undefined {
  if (raw === null || !/^\d{1,6}$/.test(raw)) return undefined;
  return Number(raw);
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

/** The `Idempotency-Key` of a create, or the 400 to answer with. */
export function requireIdempotencyKey(request: Request): string {
  const key = parseIdempotencyKey(request.headers.get(IDEMPOTENCY_HEADER));
  if (key instanceof ApiFailure) throw key;
  return key;
}

/**
 * E5 `POST /exercises` (with an `Idempotency-Key`): a custom exercise with
 * the web's fields and rules (createCustomExercise), claimed and created in
 * one transaction, so a retry of the same request answers with the first
 * result and never makes a second exercise. 201 with its detail.
 */
export async function createExerciseFromRequest(
  account: Account,
  request: Request,
): Promise<Response> {
  const key = requireIdempotencyKey(request);
  const body = await readJsonObject(request, RESOURCE_BODY_LIMIT);
  const input = {
    name: body.name,
    primaryMuscle: body.primaryMuscle,
    equipmentType: body.equipmentType,
    secondaryMuscles: body.secondaryMuscles,
  };
  return withIdempotency(
    account,
    { key, scope: "POST /v1/exercises", body: input },
    async (tx) => {
      const row = await createCustomExercise(account, input, tx);
      return { status: 201, body: toExerciseDetail(row, false) };
    },
  );
}

/** E6 `PUT /exercises/{exerciseId}/favorite`: star or unstar, for this account only. */
export async function setFavoriteFromRequest(
  account: Account,
  exerciseId: string,
  body: Record<string, unknown>,
): Promise<SetFavoriteResponseDto> {
  const { isFavorite } = body;
  if (typeof isFavorite !== "boolean") {
    throw shapeError("isFavorite", "Send isFavorite as true or false.");
  }
  return setExerciseFavorite(account, { exerciseId, isFavorite });
}

/**
 * E7 `PUT /exercises/{exerciseId}/archived`: archive the account's own custom
 * exercise, or undo that. Only `deletedAt` changes: history, plan slots,
 * goals, and baselines keep referencing it. A library exercise is a 404.
 */
export async function setExerciseArchivedFromRequest(
  account: Account,
  exerciseId: string,
  body: Record<string, unknown>,
): Promise<SetArchivedResponseDto> {
  const { archived } = body;
  if (typeof archived !== "boolean") {
    throw shapeError("archived", "Send archived as true or false.");
  }
  const { id } = archived
    ? await archiveExercise(account, { exerciseId })
    : await restoreExercise(account, { exerciseId });
  return { id, archived };
}

/**
 * E8 `POST /gyms` (with an `Idempotency-Key`): a gym with the web's fields
 * (a name and an optional line of free text; never a map or coordinates).
 * It creates ONLY the Gym row: no GymExerciseBaseline is copied or made — the
 * first workout at it establishes them. 201 with the gym.
 */
export async function createGymFromRequest(
  account: Account,
  request: Request,
): Promise<Response> {
  const key = requireIdempotencyKey(request);
  const body = await readJsonObject(request, RESOURCE_BODY_LIMIT);
  const input = { name: body.name, address: body.address };
  return withIdempotency(
    account,
    { key, scope: "POST /v1/gyms", body: input },
    async (tx) => {
      const gym = await createGym(account, input, tx);
      return {
        status: 201,
        body: { id: gym.id, name: gym.name, address: gym.address },
      };
    },
  );
}

/**
 * E9 `PUT /gyms/{gymId}/archived`: archive the account's gym, or undo that.
 * Only `deletedAt` changes: past workouts keep it, and its machine baselines
 * stay with it, untouched.
 */
export async function setGymArchivedFromRequest(
  account: Account,
  gymId: string,
  body: Record<string, unknown>,
): Promise<SetArchivedResponseDto> {
  const { archived } = body;
  if (typeof archived !== "boolean") {
    throw shapeError("archived", "Send archived as true or false.");
  }
  const { id } = archived
    ? await archiveGym(account, { gymId })
    : await restoreGym(account, { gymId });
  return { id, archived };
}
