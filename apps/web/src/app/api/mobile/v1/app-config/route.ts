import { publicMobileRoute } from "@/lib/api/mobile/pipeline";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileAppConfig } from "@/lib/api/mobile/version";

/**
 * GET /api/mobile/v1/app-config — public (Pitch 21c spec §8, §9).
 *
 * The minimum and latest app versions and the kill switches, so the server can
 * force an update or switch a feature off without a new build. Public and
 * never version-gated: an app below the minimum must still be able to learn
 * that it is. It carries no account data and no secret — never the invite
 * code, a key, a URL, or the admin allowlist — and reads no database.
 */
export const GET = publicMobileRoute(async () => apiJson(mobileAppConfig()));
