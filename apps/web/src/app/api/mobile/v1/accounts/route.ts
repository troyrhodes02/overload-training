import { mobileSignUp, SIGNUP_BODY_LIMIT } from "@/lib/api/mobile/accounts";
import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { publicVersionedMobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * POST /api/mobile/v1/accounts: native open signup (Pitch 21d spec §10.2).
 * Public (there is no account yet) and version-gated. It runs the web's own
 * signUp module, with every signup defense, and answers 201 with the new
 * account's first auth session. The account comes from the auth service,
 * never from the request.
 */
export const POST = publicVersionedMobileRoute(async ({ request }) => {
  const body = await readJsonObject(request, SIGNUP_BODY_LIMIT);
  return apiJson(await mobileSignUp(body, request.headers), { status: 201 });
});
