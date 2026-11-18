import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { WORKOUT_BODY_LIMIT } from "@/lib/api/mobile/workouts";
import { logCardioFromRequest } from "@/lib/api/mobile/logging";

/**
 * PUT /api/mobile/v1/mesocycles/{mesocycleId}/cardio-logs/{scheduledFor}
 * (Pitch 21f spec §6 E14): record the cardio done for one planned day, with
 * the web's own logCardio. Keyed by the day: a repeat answers 200 with the
 * stored record, unchanged, and alreadyLogged true. Type and whole minutes
 * only; nothing in progression reads it.
 */
export const PUT = mobileRoute<{ mesocycleId: string; scheduledFor: string }>(
  async ({ account, request }, params) => {
    const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
    return apiJson(await logCardioFromRequest(account, params, body));
  },
);
