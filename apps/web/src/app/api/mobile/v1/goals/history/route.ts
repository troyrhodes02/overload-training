import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { getGoalHistoryView } from "@/lib/views/goals";

/**
 * GET /api/mobile/v1/goals/history (Pitch 21i spec §6 E2): reached and
 * archived goals, most recently archived first, archived exercises and gyms
 * included. The web's completion check runs first. Free.
 */
export const GET = mobileRoute(async ({ account }) =>
  apiJson(await getGoalHistoryView(account)),
);
