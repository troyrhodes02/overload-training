import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { apiJson } from "@/lib/api/mobile/errors";
import { listActiveGyms } from "@/lib/gyms/queries";
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
