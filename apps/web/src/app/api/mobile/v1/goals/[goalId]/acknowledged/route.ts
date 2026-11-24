import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import {
  acknowledgeGoalFromRequest,
  GOAL_BODY_LIMIT,
} from "@/lib/api/mobile/goals";

/**
 * PUT /api/mobile/v1/goals/{goalId}/acknowledged (Pitch 21i spec §6 E6) with
 * `{ acknowledged: true }`: the one-time "Goal reached" card was seen. A
 * repeat changes nothing. Free.
 */
export const PUT = mobileRoute<{ goalId: string }>(
  async ({ account, request }, { goalId }) => {
    const body = await readJsonObject(request, GOAL_BODY_LIMIT);
    return apiJson(await acknowledgeGoalFromRequest(account, goalId, body));
  },
);
