import { readProfile, writeProfile } from "@/lib/api/mobile/account-settings";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * GET /api/mobile/v1/me/profile: the token's account's profile and the time
 * zones the server accepts (Pitch 21j E1).
 *
 * PUT /api/mobile/v1/me/profile: names, username, and time zone through the
 * web's updateProfile (E2). An absolute write, so a retry needs no key.
 */
export const GET = mobileRoute(async ({ account }) =>
  apiJson(await readProfile(account)),
);

export const PUT = mobileRoute(async ({ account, request }) =>
  apiJson(await writeProfile(account, request)),
);
