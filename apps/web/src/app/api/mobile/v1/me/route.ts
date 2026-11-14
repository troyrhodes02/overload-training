import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { apiJson } from "@/lib/api/mobile/errors";
import { getMeView } from "@/lib/views/me";

/**
 * GET /api/mobile/v1/me — the app's launch state (Pitch 21c spec §9.1):
 * profile, verified email, appearance, the resolved plan (displayed, never a
 * key to unlock anything), the tour, What's New, and the trial notice (never
 * purchasable). About the token's account only.
 */
export const GET = mobileRoute(async ({ account, email }) =>
  apiJson(await getMeView(account, email)),
);
