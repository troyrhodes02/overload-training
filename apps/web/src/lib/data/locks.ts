import "server-only";
import { Prisma } from "@prisma/client";
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
  /** The database's transaction time (one clock for every dated write). */
  lockedAt: Date;
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
    SELECT "id", "status"::text AS "status", now() AS "lockedAt" FROM "mesocycles"
    WHERE "id" = ${mesocycleId}::uuid AND "user_id" = ${account.userId}::uuid
    FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Start-of-workout lock (OVE-240): lockMesocycleForUpdate, plus, in the SAME
 * statement, whether this occurrence was moved this week and how it was
 * resolved. A workout start and a skip or move of the same occurrence then
 * run one after the other, and the common start pays one statement (the
 * OVE-212 seed budget). Every row is filtered by the acting account.
 */
export async function lockMesocycleForStart(
  account: Account,
  tx: AccountTx,
  input: { mesocycleId: string; sessionId: string; authoredOn: Date },
): Promise<{
  movedTo: Date | null;
  resolution: string | null;
} | null> {
  if (!isUuid(input.mesocycleId) || !isUuid(input.sessionId)) return null;
  const rows = await tx.$queryRaw<
    { movedTo: Date | null; resolution: string | null }[]
  >`
    SELECT
      (SELECT sm."moved_to" FROM "schedule_moves" sm
        WHERE sm."session_id" = ${input.sessionId}::uuid
          AND sm."authored_on" = ${input.authoredOn}::date
          AND sm."user_id" = ${account.userId}::uuid) AS "movedTo",
      (SELECT r."outcome"::text FROM "missed_day_resolutions" r
        WHERE r."mesocycle_id" = m."id"
          AND r."missed_on" = ${input.authoredOn}::date
          AND r."user_id" = ${account.userId}::uuid) AS "resolution"
    FROM "mesocycles" m
    WHERE m."id" = ${input.mesocycleId}::uuid AND m."user_id" = ${account.userId}::uuid
    FOR UPDATE OF m`;
  return rows[0] ?? null;
}

type HeldLocks = { sessions: Set<string>; exercises: Set<string> };
/** Workouts (and their exercises) already locked, per open transaction. */
const held = new WeakMap<object, HeldLocks>();

function heldBy(tx: AccountTx): HeldLocks {
  let h = held.get(tx);
  if (!h) {
    h = { sessions: new Set(), exercises: new Set() };
    held.set(tx, h);
  }
  return h;
}

/**
 * Lock one of the acting account's workouts (a LoggedSession) for the rest of
 * the caller's transaction, named directly or through one of its logged
 * exercises (OVE-220).
 *
 * Every write that checks a workout's state and then depends on it — log a
 * set, swap or skip an exercise, change the gym (directly or on resume),
 * lower the planned sets, finish — takes this one lock FIRST, so two requests
 * for the same workout run one after the other and a check can't be
 * overtaken by a write it was guarding against. Without it, a swap and a
 * first set sent together could both pass their "no sets yet" check, leaving
 * the set stored against a substitute it was never performed as; a gym
 * change could move a just-saved set to another gym; and a set could land in
 * a workout that had just been finished. A static guard
 * (tests/unit/workout-lock-guard.test.ts) keeps every such write on it.
 *
 * `FOR NO KEY UPDATE`: these writes conflict with each other, but not with
 * the key-share lock a new logged exercise takes on its workout.
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
export async function lockWorkoutForUpdate(
  account: Account,
  tx: AccountTx,
  ref: { loggedSessionId: string } | { loggedExerciseId: string },
): Promise<boolean> {
  const h = heldBy(tx);
  const bySession = "loggedSessionId" in ref;
  const id = bySession ? ref.loggedSessionId : ref.loggedExerciseId;
  if (!isUuid(id)) return false;
  if ((bySession ? h.sessions : h.exercises).has(id)) return true;
  const target = bySession
    ? Prisma.sql`ls."id" = ${id}::uuid`
    : Prisma.sql`ls."id" = (SELECT le."logged_session_id" FROM "logged_exercises" le
        WHERE le."id" = ${id}::uuid AND le."user_id" = ${account.userId}::uuid)`;
  const rows = await tx.$queryRaw<{ id: string; exerciseIds: string[] }[]>`
    SELECT ls."id",
      ARRAY(SELECT x."id"::text FROM "logged_exercises" x
            WHERE x."logged_session_id" = ls."id") AS "exerciseIds"
    FROM "logged_sessions" ls
    WHERE ${target} AND ls."user_id" = ${account.userId}::uuid
    FOR NO KEY UPDATE OF ls`;
  const row = rows[0];
  if (!row) return false;
  h.sessions.add(row.id);
  for (const x of row.exerciseIds) h.exercises.add(x);
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
