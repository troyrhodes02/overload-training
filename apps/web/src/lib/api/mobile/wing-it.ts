import "server-only";
import type { Account } from "@/lib/data/account";
import {
  addWingItExercise,
  getAddExerciseContext,
  startWingItWorkout,
} from "@/lib/logging/wing-it";
import type {
  AddExerciseContextDto,
  AddWingItExerciseResponseDto,
  StartWingItResponseDto,
} from "@overload/shared/contracts/logging";
import { ApiFailure, shapeError } from "./errors";

/**
 * Wing-It Workouts' mobile adapters (Pitch 25 spec §8). Like the Workout
 * Loop's, each is a thin shell over the module the web's own server actions
 * call (src/lib/logging/wing-it.ts), unchanged: the account is the verified
 * token's, every read and write runs on its scoped client, and every rule
 * (one open Wing-It workout, the active-workout refusal, which exercises may
 * be added) stays in that module. The adapters only check a request's SHAPE.
 *
 * Retry safety comes from natural keys, so no Idempotency-Key is needed: an
 * account has at most one open Wing-It workout (a repeated start answers with
 * it), and a workout has one card per exercise (a repeated add answers with
 * it). Remove is the existing `PUT /logged-exercises/{id}/skipped`.
 */

/** W1 `POST /wing-it-workouts`: start at a gym, or resume the open one. */
export async function startWingItFromRequest(
  account: Account,
  body: Record<string, unknown>,
): Promise<StartWingItResponseDto> {
  const { gymId } = body;
  if (typeof gymId !== "string") throw shapeError("gymId", "Choose a gym.");
  return startWingItWorkout(account, { gymId });
}

/**
 * W2 `GET /workouts/{loggedSessionId}/exercise-candidates?muscle=`: the Add
 * exercise picker's list — one muscle group, or every group by default.
 * Another account's workout, or a planned one, is "not found".
 */
export async function readAddExerciseCandidates(
  account: Account,
  loggedSessionId: string,
  muscle: string | null,
): Promise<AddExerciseContextDto> {
  const context = await getAddExerciseContext(account, loggedSessionId, muscle);
  if (!context) {
    throw new ApiFailure("not_found", "That workout doesn't exist.");
  }
  return context;
}

/** W3 `PUT /workouts/{loggedSessionId}/exercises/{exerciseId}`: add (or reopen) a card. */
export async function addWingItExerciseFromRequest(
  account: Account,
  params: { loggedSessionId: string; exerciseId: string },
): Promise<AddWingItExerciseResponseDto> {
  return addWingItExercise(account, params);
}
