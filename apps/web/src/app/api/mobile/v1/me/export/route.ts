import { readExport } from "@/lib/api/mobile/account-settings";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * GET /api/mobile/v1/me/export: the token's account's complete data export,
 * the document the web's /settings/export downloads (Pitch 21j E7; RD-12).
 * Free, read-only, and answered with `Cache-Control: no-store` like every
 * mobile response.
 */
export const GET = mobileRoute(async ({ account }) =>
  apiJson(await readExport(account)),
);
