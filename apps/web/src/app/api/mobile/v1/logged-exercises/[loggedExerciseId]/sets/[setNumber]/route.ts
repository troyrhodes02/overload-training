import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import {
  logSetFromRequest,
  WORKOUT_BODY_LIMIT,
} from "@/lib/api/mobile/workouts";

/**
 * PUT /api/mobile/v1/logged-exercises/{loggedExerciseId}/sets/{setNumber}
 * (Pitch 21e spec §6 E3): log one set through the web's write path
 * (logged-sets.ts, with any baseline correction in the set's transaction),
 * then reconcile goals after commit. Keyed by (loggedExerciseId, setNumber):
 * an identical re-send answers 200 with the stored set, different values are
 * a 409 conflict, and a finished workout refuses new sets.
 */
export const PUT = mobileRoute<{ loggedExerciseId: string; setNumber: string }>(
  async ({ account, request }, params) => {
    const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
    return apiJson(await logSetFromRequest(account, params, body));
  },
);
