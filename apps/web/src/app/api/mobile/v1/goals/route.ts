import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { getGoalsOverview } from "@/lib/views/goals";

/**
 * GET /api/mobile/v1/goals (Pitch 21i spec §6 E1): the Goals tab — the
 * unacknowledged "Goal reached" cards, the active goals with the web's
 * percent and best session, and the history count. The web's completion
 * check runs first, as on the web's Goals page. Free.
 */
export const GET = mobileRoute(async ({ account }) =>
  apiJson(await getGoalsOverview(account)),
);
