import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { apiJson } from "@/lib/api/mobile/errors";
import { listActiveGyms } from "@/lib/gyms/queries";
import { createGymFromRequest } from "@/lib/api/mobile/resources";
import type { GymsResponseDto } from "@overload/shared/contracts/gyms";

/**
 * GET /api/mobile/v1/gyms — the token's account's active gyms, alphabetical
 * (Pitch 21c spec §9). An object, not a bare array, so v1 can grow. The
 * address is personal location data and appears only on gym surfaces.
 */
export const GET = mobileRoute(async ({ account }) => {
  const body: GymsResponseDto = { gyms: await listActiveGyms(account) };
  return apiJson(body);
});

/**
 * POST /api/mobile/v1/gyms (Pitch 21h spec §6 E8), with an `Idempotency-Key`:
 * add a gym — a name and an optional free-text location — with the web's
 * rules. Only the Gym row is created; no baseline. A retry with the same key
 * answers with the first result. Free.
 */
export const POST = mobileRoute(async ({ account, request }) =>
  createGymFromRequest(account, request),
);
