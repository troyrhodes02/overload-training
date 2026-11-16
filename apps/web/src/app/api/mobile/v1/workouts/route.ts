import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { startWorkout, WORKOUT_BODY_LIMIT } from "@/lib/api/mobile/workouts";

/**
 * POST /api/mobile/v1/workouts (Pitch 21e spec §6 E1): start a planned
 * occurrence, or resume the workout already started for it. The web's own
 * startOrResumeWorkout, keyed by (sessionId, scheduledFor), so a repeat
 * returns the same workout and never a second one.
 */
export const POST = mobileRoute(async ({ account, request }) => {
  const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
  return apiJson(await startWorkout(account, body));
});
