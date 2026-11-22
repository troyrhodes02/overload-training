import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readPlanSession } from "@/lib/api/mobile/resources";

/**
 * GET /api/mobile/v1/mesocycles/{mesocycleId}/sessions/{sessionId} (Pitch 21h
 * spec §6 E2): one authored session — its exercises in plan order with their
 * planned sets and rep targets, and its weekday's planned cardio. Another
 * account's ids, or ids that don't belong together, are a 404 like missing
 * ones. Read-only and Free.
 */
export const GET = mobileRoute<{ mesocycleId: string; sessionId: string }>(
  async ({ account }, { mesocycleId, sessionId }) =>
    apiJson(await readPlanSession(account, mesocycleId, sessionId)),
);
