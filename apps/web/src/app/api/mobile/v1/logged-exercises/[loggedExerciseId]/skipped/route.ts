import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { WORKOUT_BODY_LIMIT } from "@/lib/api/mobile/workouts";
import { setSkippedFromRequest } from "@/lib/api/mobile/logging";

/**
 * PUT /api/mobile/v1/logged-exercises/{loggedExerciseId}/skipped (Pitch 21f
 * spec §6 E11): mark an exercise not done, or undo that, with the web's own
 * setExerciseSkipped. Only with no sets logged, in an in-progress workout. It
 * records a fact and creates no set. Marking it twice keeps the first time.
 */
export const PUT = mobileRoute<{ loggedExerciseId: string }>(
  async ({ account, request }, { loggedExerciseId }) => {
    const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
    return apiJson(
      await setSkippedFromRequest(account, loggedExerciseId, body),
    );
  },
);
