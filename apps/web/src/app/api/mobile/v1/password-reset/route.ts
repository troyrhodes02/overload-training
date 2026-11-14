import {
  mobileRequestPasswordReset,
  RESET_BODY_LIMIT,
} from "@/lib/api/mobile/accounts";
import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { publicVersionedMobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * POST /api/mobile/v1/password-reset: the native reset request (Pitch 21d spec
 * §10.5). Public and version-gated. It uses the web's requestPasswordReset
 * unchanged, so the answer is identical for every well-formed address that
 * passes the challenge. The reset itself completes on the web through the
 * email link.
 */
export const POST = publicVersionedMobileRoute(async ({ request }) => {
  const body = await readJsonObject(request, RESET_BODY_LIMIT);
  return apiJson(await mobileRequestPasswordReset(body, request.headers));
});
