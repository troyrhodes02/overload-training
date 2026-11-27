import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readAddExerciseCandidates } from "@/lib/api/mobile/wing-it";

/**
 * GET /api/mobile/v1/workouts/{loggedSessionId}/exercise-candidates (Pitch 25
 * spec §8 W2): the Add exercise picker's list for a Wing-It workout. `?muscle=`
 * names one muscle group; without it, or with an unknown value, every group
 * is listed. Only the shared library and the account's own exercises appear.
 */
export const GET = mobileRoute<{ loggedSessionId: string }>(
  async ({ account, request }, { loggedSessionId }) =>
    apiJson(
      await readAddExerciseCandidates(
        account,
        loggedSessionId,
        new URL(request.url).searchParams.get("muscle"),
      ),
    ),
);
