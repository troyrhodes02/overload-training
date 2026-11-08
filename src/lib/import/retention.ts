import "server-only";
import { Prisma } from "@prisma/client";
import type { Account } from "@/lib/data/account";
import { removeSourceObjects } from "./storage";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-109) — retention & cleanup for the
 * acting account's OWN import content (blueprint §4.4, spec §17, RD-13).
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT.
 *
 * The standing target is: unconfirmed source bytes and draft content live at most
 * RETENTION_HOURS (24h) from creation. There are four implementable backstops,
 * all here or in sibling modules:
 *   1. lazy per-request sweep (this module) — on the acting account's next
 *      request, its OWN overdue unconfirmed sessions are expired and their blobs
 *      removed;
 *   2. cleanup on confirm (confirm.ts) and discard (sessions.ts);
 *   3. account-deletion stored-object sweep (accounts/deletion.ts);
 *   4. retriable blob-delete tombstones (ImportSession.sourcesPurgedAt) + the
 *      operator cleanup script.
 *
 * WHAT IS BLOCKED (do NOT silently add): a reliable <=24h *scheduled* purge of a
 * session that is abandoned and NEVER reopened. That needs a scheduler/cron/queue
 * the repo deliberately does not have (architecture infra non-goal). Lazy cleanup
 * alone cannot substantiate an at-most-24h guarantee for a never-reopened session.
 * Until an owner/infra decision adds durable scheduling, the operator cleanup
 * script is the manual stand-in. This is recorded in the run report as a PARTIAL
 * block on P22-04 retention, not a pass.
 *
 * ACCOUNT ISOLATION: every read and write goes through `account.db`, which
 * intersects each query with `userId = acting`. This sweep touches ONLY the
 * acting account's rows — never another account's, never the global ledger. A
 * cross-account purge is the operator script's job (it is loopback-only and names
 * its scope), never a lazy request-time path.
 */

/** Terminal statuses whose stored sources should be gone. */
const TERMINAL_STATUSES = [
  "confirmed",
  "discarded",
  "expired",
  "purged",
] as const;

/**
 * Collect the object paths for a set of sessions (the acting account's own),
 * de-duplicated. A text-only session contributes none.
 */
async function objectPathsForSessions(
  account: Account,
  sessionIds: string[],
): Promise<string[]> {
  if (sessionIds.length === 0) return [];
  const parts = await account.db.importSourcePart.findMany({
    where: { sessionId: { in: sessionIds }, objectPath: { not: null } },
    select: { objectPath: true },
  });
  const paths = new Set<string>();
  for (const p of parts) if (p.objectPath) paths.add(p.objectPath);
  return [...paths];
}

/**
 * Expire the acting account's OWN overdue, unconfirmed sessions: delete their
 * draft + source parts, remove the stored objects, and transition the session to
 * `purged`. Runs lazily on a request — it is bounded (a `take` cap) so one sweep
 * can never make a request slow, and it never throws (retention is hygiene, never
 * correctness). Returns how many sessions were purged.
 *
 * A confirmed session is NEVER touched here (it owns a real plan). Only
 * unconfirmed content expires.
 */
export async function sweepExpiredImports(
  account: Account,
  opts: { now?: Date; limit?: number } = {},
): Promise<{ purged: number }> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 20;
  try {
    // Candidates: this account's unconfirmed sessions past their retention clock.
    const overdue = await account.db.importSession.findMany({
      where: {
        expiresAt: { lt: now },
        status: {
          notIn: ["confirmed", "discarded", "expired", "purged"],
        },
      },
      select: { id: true },
      take: limit,
    });
    if (overdue.length === 0) return { purged: 0 };
    const ids = overdue.map((s) => s.id);

    const paths = await objectPathsForSessions(account, ids);

    // Delete draft + parts and mark the session purged in one transaction, scoped
    // to the acting account. The blob removal is best-effort AFTER commit; if it
    // fails the session stays a retriable tombstone (sources_purged_at null).
    await account.db.$transaction(async (tx) => {
      await tx.importSourcePart.deleteMany({
        where: { sessionId: { in: ids } },
      });
      await tx.importSession.updateMany({
        where: { id: { in: ids } },
        data: { status: "purged", draft: Prisma.DbNull, errorCode: null },
      });
    });

    const purgedObjects = await safeRemove(paths);
    if (purgedObjects) {
      await account.db.importSession.updateMany({
        where: { id: { in: ids } },
        data: { sourcesPurgedAt: now },
      });
    }
    return { purged: ids.length };
  } catch {
    // A sweep failure must never surface to the lifter's request.
    return { purged: 0 };
  }
}

/**
 * Retry stored-object removal for the acting account's OWN terminal sessions that
 * are still tombstoned (sources_purged_at is null). This closes the window where a
 * confirm/discard left objects behind because the blob delete failed. Bounded and
 * non-throwing like the sweep. Returns how many tombstones were cleared.
 *
 * A tombstone is the record that "this terminal session's blobs still need
 * removing". It is OBSERVABLE (a plain query) and RETRIABLE (this function, the
 * lazy sweep, and the operator script all run it). A failed blob delete here
 * leaves the tombstone standing and NEVER undoes the confirmed plan.
 */
export async function retryTombstones(
  account: Account,
  opts: { now?: Date; limit?: number } = {},
): Promise<{ cleared: number }> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 20;
  try {
    const pending = await account.db.importSession.findMany({
      where: {
        sourcesPurgedAt: null,
        status: { in: [...TERMINAL_STATUSES] },
      },
      select: { id: true },
      take: limit,
    });
    if (pending.length === 0) return { cleared: 0 };

    let cleared = 0;
    for (const { id } of pending) {
      const paths = await objectPathsForSessions(account, [id]);
      const ok = await safeRemove(paths);
      // Clear the tombstone only when the removal succeeded (or there was nothing
      // to remove). A still-failing delete leaves the tombstone for next time.
      if (ok) {
        await account.db.importSession.updateMany({
          where: { id, sourcesPurgedAt: null },
          data: { sourcesPurgedAt: now },
        });
        cleared += 1;
      }
    }
    return { cleared };
  } catch {
    return { cleared: 0 };
  }
}

/**
 * Remove stored objects, reporting whether the removal is believed to have
 * succeeded (so the caller may clear the tombstone). An empty path list is a
 * success (nothing to remove). `removeSourceObjects` itself is best-effort and
 * never throws; a thrown error here is treated as "not cleared".
 */
async function safeRemove(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  try {
    await removeSourceObjects(paths);
    return true;
  } catch {
    return false;
  }
}

/**
 * The one entry point a request should call: sweep this account's expired imports
 * and retry any outstanding tombstones. Bounded and non-throwing; safe to call on
 * every `/plan/import` load and status poll without slowing the page.
 */
export async function runImportRetention(account: Account): Promise<void> {
  await sweepExpiredImports(account);
  await retryTombstones(account);
}
