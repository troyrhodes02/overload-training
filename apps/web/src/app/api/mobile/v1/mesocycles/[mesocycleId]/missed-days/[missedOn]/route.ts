import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import {
  resolveMissedDayFromRequest,
  WORKOUT_BODY_LIMIT,
} from "@/lib/api/mobile/workouts";

/**
 * PUT /api/mobile/v1/mesocycles/{mesocycleId}/missed-days/{missedOn}
 * (Pitch 21e spec §6 E7, RD-23): resolve a missed day as shifted or skipped,
 * with the web's own resolveMissedDay. Retry-safe by the day's natural key:
 * the same outcome again answers 200 with the stored resolution, a different
 * outcome is a 409 conflict. Free, like the rest of logging.
 */
export const PUT = mobileRoute<{ mesocycleId: string; missedOn: string }>(
  async ({ account, request }, params) => {
    const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
    return apiJson(await resolveMissedDayFromRequest(account, params, body));
  },
);
