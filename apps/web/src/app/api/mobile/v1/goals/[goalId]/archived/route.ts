import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import {
  GOAL_BODY_LIMIT,
  setGoalArchivedFromRequest,
} from "@/lib/api/mobile/goals";

/**
 * PUT /api/mobile/v1/goals/{goalId}/archived (Pitch 21i spec §6 E5) with
 * `{ archived: true }`: move an active goal to the goal history, as the web's
 * Archive goal does. No undo. A retry answers success and changes nothing.
 * Free.
 */
export const PUT = mobileRoute<{ goalId: string }>(
  async ({ account, request }, { goalId }) => {
    const body = await readJsonObject(request, GOAL_BODY_LIMIT);
    return apiJson(await setGoalArchivedFromRequest(account, goalId, body));
  },
);
