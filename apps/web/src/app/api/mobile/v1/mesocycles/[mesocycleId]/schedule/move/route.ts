import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { moveFromRequest } from "@/lib/api/mobile/schedule";

/**
 * POST /api/mobile/v1/mesocycles/{mesocycleId}/schedule/move (OVE-241 S3):
 * "Train today", or swap two days this week (a workout with another, or
 * with a rest day), as the web's strip does. The plan and next week never
 * change. A retry answers `unchanged`; a stale week is a 409. Free.
 */
export const POST = mobileRoute<{ mesocycleId: string }>(
  async ({ account, request }, { mesocycleId }) =>
    apiJson(await moveFromRequest(account, mesocycleId, request)),
);
