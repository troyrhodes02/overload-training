import "server-only";
import { isUuid } from "@/lib/actions/result";
import type { MesocycleStatusValue } from "@overload/shared/enums";
import type { Account } from "./account";
import type { AccountTx } from "./account-db";

/**
 * Row locks that Prisma cannot express. Raw SQL bypasses the account-scoping
 * extension, so it lives ONLY in src/lib/data (static guard) and filters by
 * the acting account explicitly.
 */

export type LockedMesocycle = {
  id: string;
  status: MesocycleStatusValue;
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

/**
 * A transaction-scoped advisory lock that serializes starting a hosted
 * Checkout for ONE account (OVE-112). Two concurrent subscribe clicks, two
 * tabs, or a retry queue up behind each other, so the open-session and
 * open-subscription checks that follow can't interleave and each start a
 * payable session. It keys only on the acting account and blocks no row, so
 * the webhook and every other write proceed normally. Released at commit or
 * rollback.
 */
export async function lockCheckoutForAccount(
  account: Account,
  tx: AccountTx,
): Promise<void> {
  const key = `overload:checkout:${account.userId}`;
  await tx.$queryRaw`
    SELECT 1 AS "locked" FROM (
      SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
    ) AS l`;
}
