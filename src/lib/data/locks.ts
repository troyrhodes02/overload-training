import "server-only";
import { isUuid } from "@/lib/actions/result";
import type { Account } from "./account";
import type { AccountTx } from "./account-db";

/**
 * Row locks that Prisma cannot express. Raw SQL bypasses the account-scoping
 * extension, so it lives ONLY in src/lib/data (static guard) and filters by
 * the acting account explicitly.
 */

export type LockedMesocycle = {
  id: string;
  status: "draft" | "active" | "archived";
};

/**
 * SELECT … FOR UPDATE on one of the acting account's mesocycles, inside the
 * caller's transaction, so a status check and the write that depends on it
 * can't interleave with another tab's activation, archive, or edit. Another
 * account's mesocycle is simply not found (null), exactly like a missing one.
 */
export async function lockMesocycleForUpdate(
  account: Account,
  tx: AccountTx,
  mesocycleId: string,
): Promise<LockedMesocycle | null> {
  if (!isUuid(mesocycleId)) return null;
  const rows = await tx.$queryRaw<LockedMesocycle[]>`
    SELECT "id", "status"::text AS "status" FROM "mesocycles"
    WHERE "id" = ${mesocycleId}::uuid AND "user_id" = ${account.userId}::uuid
    FOR UPDATE`;
  return rows[0] ?? null;
}
