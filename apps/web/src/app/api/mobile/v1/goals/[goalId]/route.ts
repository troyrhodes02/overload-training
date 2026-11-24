import { ApiFailure, apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { getGoalDetailView } from "@/lib/views/goals";

/**
 * GET /api/mobile/v1/goals/{goalId} (Pitch 21i spec §6 E3): one goal — an
 * active one with its percent and best session, or a reached or archived one
 * with its outcome and whether its card is still to be seen. The web's
 * completion check runs first. Another account's goal is a 404 like a
 * missing one. Free.
 */
export const GET = mobileRoute<{ goalId: string }>(
  async ({ account }, { goalId }) => {
    const goal = await getGoalDetailView(account, goalId);
    if (!goal) throw new ApiFailure("not_found", "That goal doesn't exist.");
    return apiJson(goal);
  },
);
