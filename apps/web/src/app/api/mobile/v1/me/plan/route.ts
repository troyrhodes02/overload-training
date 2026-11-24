import { readPlanAccess } from "@/lib/api/mobile/account-settings";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * GET /api/mobile/v1/me/plan: the plan, read-only (Pitch 21j E3; RD-15). The
 * web's app-shell projection of Plan & Billing: no price, no purchase or
 * manage action, no promo, and no Stripe call.
 */
export const GET = mobileRoute(async ({ account }) =>
  apiJson(await readPlanAccess(account)),
);
