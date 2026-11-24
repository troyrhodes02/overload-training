import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { skipFromRequest } from "@/lib/api/mobile/schedule";

/**
 * POST /api/mobile/v1/mesocycles/{mesocycleId}/schedule/skip (OVE-241 S2):
 * skip a workout today or later this week, as the web's Skip workout does.
 * It never comes back as a missed workout; next week is unchanged. A retry
 * succeeds and writes nothing. Free.
 */
export const POST = mobileRoute<{ mesocycleId: string }>(
  async ({ account, request }, { mesocycleId }) =>
    apiJson(await skipFromRequest(account, mesocycleId, request)),
);
