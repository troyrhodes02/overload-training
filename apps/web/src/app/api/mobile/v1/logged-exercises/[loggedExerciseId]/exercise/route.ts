import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { WORKOUT_BODY_LIMIT } from "@/lib/api/mobile/workouts";
import { swapExerciseFromRequest } from "@/lib/api/mobile/logging";

/**
 * PUT /api/mobile/v1/logged-exercises/{loggedExerciseId}/exercise (Pitch 21f
 * spec §6 E10): swap what is performed in this occurrence, with the web's own
 * swapExercise. Only before the exercise's first set, in an in-progress
 * workout, to an active exercise the account can see. The planned exercise
 * and the plan are never written.
 */
export const PUT = mobileRoute<{ loggedExerciseId: string }>(
  async ({ account, request }, { loggedExerciseId }) => {
    const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
    return apiJson(
      await swapExerciseFromRequest(account, loggedExerciseId, body),
    );
  },
);
