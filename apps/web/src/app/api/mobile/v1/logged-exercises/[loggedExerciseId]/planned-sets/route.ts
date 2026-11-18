import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { WORKOUT_BODY_LIMIT } from "@/lib/api/mobile/workouts";
import { editPlannedSetsFromRequest } from "@/lib/api/mobile/logging";

/**
 * PATCH /api/mobile/v1/logged-exercises/{loggedExerciseId}/planned-sets
 * (Pitch 21f spec §6 E13): lower this workout's planned-set count for one
 * exercise, with the web's own editPlannedSets, then reconcile goals. It can
 * only go down, the plan is never written, and no logged set is removed.
 */
export const PATCH = mobileRoute<{ loggedExerciseId: string }>(
  async ({ account, request }, { loggedExerciseId }) => {
    const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
    return apiJson(
      await editPlannedSetsFromRequest(account, loggedExerciseId, body),
    );
  },
);
