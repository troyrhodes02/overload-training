import "server-only";
import type { Account } from "@/lib/data/account";
import {
  changeGym,
  setExerciseSkipped,
  swapExercise,
} from "@/lib/logging/sessions";
import {
  editLoggedSetAndReconcile,
  editPlannedSetsAndReconcile,
} from "@/lib/logging/workflows";
import { getSwapContext } from "@/lib/logging/queries";
import { editCardioLog, logCardio } from "@/lib/cardio/cardio-logs";
import type {
  EditCardioLogResponseDto,
  LogCardioResponseDto,
} from "@overload/shared/contracts/cardio";
import type {
  ChangeGymResponseDto,
  EditPlannedSetsResponseDto,
  SetSkippedResponseDto,
  SwapContextDto,
  SwapExerciseResponseDto,
} from "@overload/shared/contracts/logging";
import type { LoggedSetDto } from "@overload/shared/contracts/views";
import { ApiFailure } from "./errors";
import { toLoggedSetDto } from "./serialize";

/**
 * Logging Completeness's mobile adapters (Pitch 21f spec §6). Like the
 * Workout Loop's (workouts.ts), each is a thin shell over the module the
 * web's own server actions call, unchanged: the account is the verified
 * token's, every read and write runs on its scoped client, and every rule
 * (which gym, when a swap or a skip is allowed, what a set or a cardio entry
 * may hold, how far planned sets can drop) stays in that module, so both
 * clients share one rule set. The adapters only check a request's SHAPE.
 *
 * Every write is safe to repeat (RD-4): each sets an absolute value, and
 * logging cardio is keyed by its day, so a retry on a weak connection writes
 * nothing more.
 */

function shapeError(field: string, message: string): ApiFailure {
  return new ApiFailure("validation_error", message, { [field]: message });
}

/**
 * E8 `PUT /workouts/{loggedSessionId}/gym`: where this workout is logged.
 * The module refuses it once any set exists, so a saved set is never
 * re-attached to another gym and no baseline can move with it.
 */
export async function changeGymFromRequest(
  account: Account,
  loggedSessionId: string,
  body: Record<string, unknown>,
): Promise<ChangeGymResponseDto> {
  const { gymId } = body;
  if (typeof gymId !== "string") throw shapeError("gymId", "Choose a gym.");
  await changeGym(account, { loggedSessionId, gymId });
  return { loggedSessionId, gymId };
}

/**
 * E9 `GET /logged-exercises/{loggedExerciseId}/swap-candidates?muscle=`: the
 * picker's list for one muscle group (the planned exercise's by default, any
 * group on request). Only exercises this account can see.
 */
export async function readSwapCandidates(
  account: Account,
  loggedExerciseId: string,
  muscle: string | null,
): Promise<SwapContextDto> {
  const context = await getSwapContext(account, loggedExerciseId, muscle);
  if (!context) {
    throw new ApiFailure(
      "not_found",
      "That exercise isn't part of this workout.",
    );
  }
  return context;
}

/**
 * E10 `PUT /logged-exercises/{loggedExerciseId}/exercise`: what is performed
 * in this occurrence. Never the planned exercise, the session, or the plan.
 */
export async function swapExerciseFromRequest(
  account: Account,
  loggedExerciseId: string,
  body: Record<string, unknown>,
): Promise<SwapExerciseResponseDto> {
  const { newExerciseId } = body;
  if (typeof newExerciseId !== "string") {
    throw shapeError("newExerciseId", "That exercise isn't available.");
  }
  await swapExercise(account, { loggedExerciseId, newExerciseId });
  return { loggedExerciseId, exerciseId: newExerciseId };
}

/** E11 `PUT /logged-exercises/{loggedExerciseId}/skipped`: not done, or undo. */
export async function setSkippedFromRequest(
  account: Account,
  loggedExerciseId: string,
  body: Record<string, unknown>,
): Promise<SetSkippedResponseDto> {
  const { skipped } = body;
  if (typeof skipped !== "boolean") {
    throw shapeError("skipped", "Send skipped as true or false.");
  }
  await setExerciseSkipped(account, { loggedExerciseId, skipped });
  return { loggedExerciseId, skipped };
}

/**
 * E12 `PATCH /sets/{loggedSetId}`: correct one stored set's weight, reps, and
 * RIR through the one LoggedSet write module, then reconcile goals after the
 * commit. The values go to editLoggedSet as sent: its rules accept only real
 * numbers, so anything else is refused there with the web's own message.
 *
 * `rir` is passed only when the body HAS the key: absent leaves the stored
 * value, null clears it. An absent key must never turn into null.
 */
export async function editSetFromRequest(
  account: Account,
  loggedSetId: string,
  body: Record<string, unknown>,
): Promise<LoggedSetDto> {
  const set = await editLoggedSetAndReconcile(account, {
    loggedSetId,
    weightLbs: body.weightLbs as number | null | undefined,
    reps: body.reps as number,
    ...(Object.hasOwn(body, "rir")
      ? { rir: body.rir as number | null | undefined }
      : {}),
  });
  return toLoggedSetDto(set);
}

/**
 * E13 `PATCH /logged-exercises/{loggedExerciseId}/planned-sets`: lower this
 * occurrence's planned-set count (the module's rule: a whole number from 1 up
 * to the current count). The plan is never written and no set is removed.
 */
export async function editPlannedSetsFromRequest(
  account: Account,
  loggedExerciseId: string,
  body: Record<string, unknown>,
): Promise<EditPlannedSetsResponseDto> {
  const plannedSets = body.plannedSets as number;
  await editPlannedSetsAndReconcile(account, { loggedExerciseId, plannedSets });
  return { loggedExerciseId, plannedSets };
}

/**
 * E14 `PUT /mesocycles/{mesocycleId}/cardio-logs/{scheduledFor}`: record what
 * was done for one planned cardio day. Keyed by the day: a repeat answers
 * with the stored record, untouched, and `alreadyLogged: true`.
 */
export async function logCardioFromRequest(
  account: Account,
  params: { mesocycleId: string; scheduledFor: string },
  body: Record<string, unknown>,
): Promise<LogCardioResponseDto> {
  return logCardio(account, {
    mesocycleId: params.mesocycleId,
    scheduledFor: params.scheduledFor,
    type: body.type,
    durationMin: body.durationMin,
  });
}

/** E15 `PATCH /cardio-logs/{cardioLogId}`: correct the activity and minutes. */
export async function editCardioFromRequest(
  account: Account,
  cardioLogId: string,
  body: Record<string, unknown>,
): Promise<EditCardioLogResponseDto> {
  const { id } = await editCardioLog(account, {
    cardioLogId,
    type: body.type,
    durationMin: body.durationMin,
  });
  return { cardioLogId: id };
}
