import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { completeWorkoutFromRequest } from "@/lib/api/mobile/workouts";

/**
 * POST /api/mobile/v1/workouts/{loggedSessionId}/complete (Pitch 21e spec §6
 * E4): finish the workout through the web's completion rule (at least one
 * set; untouched exercises recorded as not done), then the post-commit goal
 * reconciliation. Finishing a finished workout succeeds and changes nothing.
 * No body is read.
 */
export const POST = mobileRoute<{ loggedSessionId: string }>(
  async ({ account }, { loggedSessionId }) =>
    apiJson(await completeWorkoutFromRequest(account, loggedSessionId)),
);
