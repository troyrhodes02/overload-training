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
 * SELECT … FOR UPDATE on one of the acting account's workouts (a
 * LoggedSession), named either directly or through one of its logged
 * exercises, inside the caller's transaction (OVE-220).
 *
 * Every write that checks a workout's state and then depends on it — log a
 * set, swap or skip an exercise, change the gym, finish — takes this one lock
 * FIRST, so two requests for the same workout run one after the other and a
 * check can't be overtaken by a write it was guarding against. Without it, a
 * swap and a first set sent together could both pass their "no sets yet"
 * check, leaving the set stored against the substitute it was never performed
 * as; a gym change could move a just-saved set to another gym; and a set could
 * land in a workout that had just been finished.
 *
 * One lock per workout, always taken first, so these writes can't deadlock on
 * each other. Another account's workout or exercise is simply not found
 * (false), exactly like a missing one; the caller's own scoped read then
 * answers not_found.
 *
 * A row lock is held until the transaction ends, so taking it again in the
 * same transaction changes nothing. The first lock records the workout and
 * its exercises against the transaction, and later writes in that
 * transaction (a seed logging a whole workout, a finish after its sets) skip
 * the repeat query: one statement per workout, not per set (OVE-212 budget).
 * Only ever called with a transaction: outside one, a lock would end with
 * its own statement.
 */
type HeldLocks = { sessions: Set<string>; exercises: Set<string> };
const held = new WeakMap<object, HeldLocks>();

function heldBy(tx: AccountTx): HeldLocks {
  let h = held.get(tx);
  if (!h) {
    h = { sessions: new Set(), exercises: new Set() };
    held.set(tx, h);
  }
  return h;
}

export async function lockWorkoutForUpdate(
  account: Account,
  tx: AccountTx,
  ref: { loggedSessionId: string } | { loggedExerciseId: string },
): Promise<boolean> {
  const h = heldBy(tx);
  let rows: { id: string; exerciseIds: string[] }[];
  if ("loggedSessionId" in ref) {
    if (!isUuid(ref.loggedSessionId)) return false;
    if (h.sessions.has(ref.loggedSessionId)) return true;
    rows = await tx.$queryRaw<{ id: string; exerciseIds: string[] }[]>`
      SELECT ls."id",
        ARRAY(SELECT le."id"::text FROM "logged_exercises" le
              WHERE le."logged_session_id" = ls."id") AS "exerciseIds"
      FROM "logged_sessions" ls
      WHERE ls."id" = ${ref.loggedSessionId}::uuid
        AND ls."user_id" = ${account.userId}::uuid
      FOR UPDATE OF ls`;
  } else {
    if (!isUuid(ref.loggedExerciseId)) return false;
    if (h.exercises.has(ref.loggedExerciseId)) return true;
    rows = await tx.$queryRaw<{ id: string; exerciseIds: string[] }[]>`
      SELECT ls."id",
        ARRAY(SELECT x."id"::text FROM "logged_exercises" x
              WHERE x."logged_session_id" = ls."id") AS "exerciseIds"
      FROM "logged_sessions" ls
      JOIN "logged_exercises" le ON le."logged_session_id" = ls."id"
      WHERE le."id" = ${ref.loggedExerciseId}::uuid
        AND le."user_id" = ${account.userId}::uuid
        AND ls."user_id" = ${account.userId}::uuid
      FOR UPDATE OF ls`;
  }
  const row = rows[0];
  if (!row) return false;
  h.sessions.add(row.id);
  for (const id of row.exerciseIds) h.exercises.add(id);
  return true;
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
