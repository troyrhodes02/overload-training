import { postTourOffered } from "@/lib/api/mobile/account-settings";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * POST /api/mobile/v1/me/tour/offered: an automatically started native tour
 * has appeared, so the account's one automatic offer is spent (Pitch 21k
 * spec §6, T2). Idempotent: a repeat answers `{ spent: false }`.
 */
export const POST = mobileRoute(async ({ account }) =>
  apiJson(await postTourOffered(account)),
);
