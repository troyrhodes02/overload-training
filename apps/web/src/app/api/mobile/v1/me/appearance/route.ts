import type { UpdateAppearanceResponseDto } from "@overload/shared/contracts/account";
import { updateAppearance } from "@/lib/accounts/appearance";
import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * PUT /api/mobile/v1/me/appearance: the token's account's appearance
 * preference (Pitch 21d spec §10.6, RD-10). An absolute write through the
 * web's updateAppearance, so a retry sets the same value again and needs no
 * idempotency key.
 */
export const PUT = mobileRoute(async ({ account, request }) => {
  const body = await readJsonObject(request, 4 * 1024);
  const result: UpdateAppearanceResponseDto = {
    appearance: await updateAppearance(account, body.appearance),
  };
  return apiJson(result);
});
