import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import {
  RESOURCE_BODY_LIMIT,
  setFavoriteFromRequest,
} from "@/lib/api/mobile/resources";

/**
 * PUT /api/mobile/v1/exercises/{exerciseId}/favorite (Pitch 21h spec §6 E6):
 * star or unstar an exercise for this account (its ExerciseFavorite row,
 * never the shared exercise). An absolute value: a repeat writes nothing
 * more. An archived exercise can't be starred. Free.
 */
export const PUT = mobileRoute<{ exerciseId: string }>(
  async ({ account, request }, { exerciseId }) => {
    const body = await readJsonObject(request, RESOURCE_BODY_LIMIT);
    return apiJson(await setFavoriteFromRequest(account, exerciseId, body));
  },
);
