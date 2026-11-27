import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { WORKOUT_BODY_LIMIT } from "@/lib/api/mobile/workouts";
import { startWingItFromRequest } from "@/lib/api/mobile/wing-it";

/**
 * POST /api/mobile/v1/wing-it-workouts (Pitch 25 spec §8 W1): start a Wing-It
 * workout at a gym, or resume the account's open one, with the web's own
 * startWingItWorkout. One open Wing-It workout per account, so a repeat
 * answers with the same one. Refused with 409 `conflict` (details name the
 * workout) while another workout is in progress with saved sets. Never reads
 * or writes the plan.
 */
export const POST = mobileRoute(async ({ account, request }) => {
  const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
  return apiJson(await startWingItFromRequest(account, body));
});
