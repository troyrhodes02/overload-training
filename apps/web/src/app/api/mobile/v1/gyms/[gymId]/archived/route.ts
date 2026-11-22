import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import {
  RESOURCE_BODY_LIMIT,
  setGymArchivedFromRequest,
} from "@/lib/api/mobile/resources";

/**
 * PUT /api/mobile/v1/gyms/{gymId}/archived (Pitch 21h spec §6 E9):
 * `{ archived: true }` takes the gym out of the pickers (past workouts and its
 * machine baselines keep it); `false` is the Undo. Another account's gym is a
 * 404 like a missing one. Free.
 */
export const PUT = mobileRoute<{ gymId: string }>(
  async ({ account, request }, { gymId }) => {
    const body = await readJsonObject(request, RESOURCE_BODY_LIMIT);
    return apiJson(await setGymArchivedFromRequest(account, gymId, body));
  },
);
