import "server-only";
import type { Account } from "@/lib/data/account";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import {
  completeWorkoutAndReconcile,
  logSetAndReconcile,
} from "@/lib/logging/workflows";
import { getWorkoutView } from "@/lib/views/workout";
import { getHistoryWeek } from "@/lib/logging/history-week";
import { getLoggedWorkoutDetail } from "@/lib/logging/queries";
import { getSessionProgressionSummary } from "@/lib/progression/queries";
import { getSessionGoalSummary } from "@/lib/goals/queries";
import { resolveRequestEntitlement } from "@/lib/entitlements/resolve";
import type {
  CompleteWorkoutResponseDto,
  StartWorkoutResponseDto,
} from "@overload/shared/contracts/logging";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import type {
  LoggedSetDto,
  LoggedWorkoutDetailViewDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import { ApiFailure } from "./errors";
import { toLoggedSetDto } from "./serialize";

/**
 * The Workout Loop's mobile adapters (Pitch 21e spec §6). Each is a thin shell
 * over the module the web's own pages and server actions call, unchanged:
 * the account is the verified token's, every read and write runs on its
 * scoped client, and every value rule (dates, gyms, weights, reps, RIR, set
 * numbers, workout state) stays in the module, so both clients share one rule
 * set. The adapters only check a request's SHAPE and map "missing" to 404.
 *
 * Retry safety comes from the natural keys (RD-3): starting an occurrence
 * twice returns the same workout, an identical set re-send returns the stored
 * row (a different one is a 409), and finishing twice changes nothing.
 */

/** Request bodies here are a few fields; anything bigger is refused. */
export const WORKOUT_BODY_LIMIT = 4 * 1024;

const WORKOUT_NOT_FOUND = "That workout doesn't exist.";

function shapeError(field: string, message: string): ApiFailure {
  return new ApiFailure("validation_error", message, { [field]: message });
}

/** E1 `POST /workouts`: start, or resume the workout already started. */
export async function startWorkout(
  account: Account,
  body: Record<string, unknown>,
): Promise<StartWorkoutResponseDto> {
  const { sessionId, scheduledFor, gymId } = body;
  if (typeof sessionId !== "string") {
    throw shapeError("sessionId", "Choose a workout to start.");
  }
  if (typeof scheduledFor !== "string") {
    throw shapeError("scheduledFor", "Invalid date.");
  }
  if (typeof gymId !== "string") {
    throw shapeError("gymId", "Choose a gym.");
  }
  return startOrResumeWorkout(account, { sessionId, scheduledFor, gymId });
}

/** E2 `GET /workouts/{loggedSessionId}`: the runner, calls gated. */
export async function readWorkout(
  account: Account,
  loggedSessionId: string,
): Promise<WorkoutViewDto> {
  const view = await getWorkoutView(account, loggedSessionId);
  if (!view) throw new ApiFailure("not_found", WORKOUT_NOT_FOUND);
  return view;
}

/** A path set number: 1–999 written plainly; the lib applies the plan's range. */
const SET_NUMBER = /^[1-9][0-9]{0,2}$/;

/**
 * E3 `PUT /logged-exercises/{loggedExerciseId}/sets/{setNumber}`. The values
 * go to logSet as sent: its rules (checkWeightLbs, checkLoggedReps, the RIR
 * rule) accept only real numbers, so a string or a missing field is refused
 * there with the web's own message in `details`.
 */
export async function logSetFromRequest(
  account: Account,
  params: { loggedExerciseId: string; setNumber: string },
  body: Record<string, unknown>,
): Promise<LoggedSetDto> {
  if (!SET_NUMBER.test(params.setNumber)) {
    throw shapeError("setNumber", "That set doesn't exist.");
  }
  const set = await logSetAndReconcile(account, {
    loggedExerciseId: params.loggedExerciseId,
    setNumber: Number(params.setNumber),
    weightLbs: body.weightLbs as number | null | undefined,
    reps: body.reps as number,
    rir: body.rir as number | null | undefined,
  });
  return toLoggedSetDto(set);
}

/** E4 `POST /workouts/{loggedSessionId}/complete`. */
export async function completeWorkoutFromRequest(
  account: Account,
  loggedSessionId: string,
): Promise<CompleteWorkoutResponseDto> {
  await completeWorkoutAndReconcile(account, { loggedSessionId });
  return { loggedSessionId, status: "complete" };
}

/** E5 `GET /history?week=`: one week of all-time history. */
export async function readHistoryWeek(
  account: Account,
  week: string | null,
): Promise<HistoryWeekDto> {
  return getHistoryWeek(account, week);
}

/**
 * E6 `GET /history/{loggedSessionId}`: one logged workout as recorded, with
 * its gated summary (locked for Free) and the goals it moved.
 */
export async function readLoggedWorkout(
  account: Account,
  loggedSessionId: string,
): Promise<LoggedWorkoutDetailViewDto> {
  const detail = await getLoggedWorkoutDetail(account, loggedSessionId);
  if (!detail) throw new ApiFailure("not_found", WORKOUT_NOT_FOUND);
  const entitlement = await resolveRequestEntitlement(account);
  const [summary, goals] = await Promise.all([
    getSessionProgressionSummary(account, detail.loggedSessionId, {
      entitlement,
    }),
    getSessionGoalSummary(account, detail.loggedSessionId),
  ]);
  return { detail, summary, goals };
}
