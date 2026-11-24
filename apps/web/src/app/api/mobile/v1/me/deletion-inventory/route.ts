import { readDeletionInventory } from "@/lib/api/mobile/account-deletion";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * GET /api/mobile/v1/me/deletion-inventory: what deleting the token's account
 * would remove, in the lifter's own numbers (Pitch 21j E8), the web delete
 * page's inventory. Read-only.
 */
export const GET = mobileRoute(async ({ account }) =>
  apiJson(await readDeletionInventory(account)),
);
