import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { getGoalsOverview } from "@/lib/views/goals";
import { createGoalFromRequest } from "@/lib/api/mobile/goals";

/**
 * GET /api/mobile/v1/goals (Pitch 21i spec §6 E1): the Goals tab — the
 * unacknowledged "Goal reached" cards, the active goals with the web's
 * percent and best session, and the history count. The web's completion
 * check runs first, as on the web's Goals page. Free.
 */
export const GET = mobileRoute(async ({ account }) =>
  apiJson(await getGoalsOverview(account)),
);

/**
 * POST /api/mobile/v1/goals (Pitch 21i spec §6 E4), with an
 * `Idempotency-Key`: set a weight × reps goal with the web's rules. A retry
 * with the same key answers with the first result; a second active goal on
 * the exercise is the web's conflict, with the existing goal's id. Free.
 */
export const POST = mobileRoute(async ({ account, request }) =>
  createGoalFromRequest(account, request),
);
