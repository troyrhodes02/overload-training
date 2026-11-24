import { markSeen } from "@/lib/api/mobile/account-settings";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * POST /api/mobile/v1/me/release-notes/seen: the native What's New sheet was
 * shown, so everything through `throughId` is seen (Pitch 21j E5; RD-5). The
 * one forward-only seen point the web dialog uses, so a repeat is a no-op.
 */
export const POST = mobileRoute(async ({ account, request }) =>
  apiJson(await markSeen(account, request)),
);
