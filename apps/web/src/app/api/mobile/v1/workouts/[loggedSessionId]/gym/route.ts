import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { WORKOUT_BODY_LIMIT } from "@/lib/api/mobile/workouts";
import { changeGymFromRequest } from "@/lib/api/mobile/logging";

/**
 * PUT /api/mobile/v1/workouts/{loggedSessionId}/gym (Pitch 21f spec §6 E8):
 * change where the workout is logged, with the web's own changeGym. Allowed
 * only while the workout has no set; after that the gym is locked, so a saved
 * set and its gym baseline can never be moved. Setting the same gym again
 * changes nothing.
 */
export const PUT = mobileRoute<{ loggedSessionId: string }>(
  async ({ account, request }, { loggedSessionId }) => {
    const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
    return apiJson(await changeGymFromRequest(account, loggedSessionId, body));
  },
);
