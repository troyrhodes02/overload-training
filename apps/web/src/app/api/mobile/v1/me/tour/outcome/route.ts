import { putTourOutcome } from "@/lib/api/mobile/account-settings";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * PUT /api/mobile/v1/me/tour/outcome: the native tour was finished
 * ("completed") or skipped ("skipped") (Pitch 21k spec §6, T1). The web
 * tour's own recorder, so both clients share one latest outcome per account.
 */
export const PUT = mobileRoute(async ({ account, request }) =>
  apiJson(await putTourOutcome(account, request)),
);
