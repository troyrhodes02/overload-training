import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { addWingItExerciseFromRequest } from "@/lib/api/mobile/wing-it";

/**
 * PUT /api/mobile/v1/workouts/{loggedSessionId}/exercises/{exerciseId} (Pitch
 * 25 spec §8 W3): add an exercise to a Wing-It workout, with the web's own
 * addWingItExercise. A natural key: one card per exercise, so a repeat
 * answers with the same card (`added: false`). No body is read.
 */
export const PUT = mobileRoute<{ loggedSessionId: string; exerciseId: string }>(
  async ({ account }, params) =>
    apiJson(await addWingItExerciseFromRequest(account, params)),
);
