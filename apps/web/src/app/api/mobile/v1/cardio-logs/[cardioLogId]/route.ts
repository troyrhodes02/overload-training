import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { WORKOUT_BODY_LIMIT } from "@/lib/api/mobile/workouts";
import { editCardioFromRequest } from "@/lib/api/mobile/logging";

/**
 * PATCH /api/mobile/v1/cardio-logs/{cardioLogId} (Pitch 21f spec §6 E15):
 * correct a cardio record's activity and minutes, with the web's own
 * editCardioLog. Its plan snapshot and dates never change.
 */
export const PATCH = mobileRoute<{ cardioLogId: string }>(
  async ({ account, request }, { cardioLogId }) => {
    const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
    return apiJson(await editCardioFromRequest(account, cardioLogId, body));
  },
);
