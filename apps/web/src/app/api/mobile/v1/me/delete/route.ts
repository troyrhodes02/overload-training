import { deleteAccountFromApp } from "@/lib/api/mobile/account-deletion";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * POST /api/mobile/v1/me/delete `{ password }`: permanently delete the token's
 * account (Pitch 21j E9; RD-16, RD-17). The web's password re-check with the
 * token's own email, then the one deletion module, which cancels any live
 * Stripe subscription before it deletes anything. Effectively idempotent: once
 * deleted, the token no longer verifies, so a retry is a 401 (spec §5).
 */
export const POST = mobileRoute(async ({ account, email, request }) =>
  apiJson(await deleteAccountFromApp(account, email, request)),
);
