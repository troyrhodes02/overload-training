/**
 * Workout Plan Import & Review (Pitch 22, OVE-109) — operator cleanup for
 * abandoned import sources (blueprint §4.4, spec §17, RD-13). Operator tooling:
 * never imported by `src/`, no route, run by a human from the runbook.
 *
 * WHY THIS EXISTS. The repo deliberately has no scheduler/cron/queue (an
 * architecture non-goal), so the reliable <=24h *scheduled* purge of a session
 * that is abandoned and NEVER reopened CANNOT be guaranteed by request-time
 * (lazy) cleanup alone — a never-reopened session's lazy sweep never fires. Until
 * an owner/infra decision adds durable scheduling, THIS manual, operator-run
 * script is the stand-in: a human runs it to purge globally-expired unconfirmed
 * sessions and to retry any outstanding blob-delete tombstones.
 *
 * SAFETY (mirrors scripts/operator/founding-members):
 *  - DRY RUN by default: prints exactly what WOULD be purged and writes nothing.
 *  - --execute writes; a non-local DB host is refused unless --confirm-host
 *    equals it exactly (loopback-only by default).
 *  - CREATE/DELETE scope is NAMED and NARROW: only unconfirmed sessions past
 *    their retention clock (sources + draft removed, status -> purged) and
 *    terminal sessions still tombstoned (blobs retried). A CONFIRMED session is
 *    NEVER purged and its plan is NEVER touched — a failed blob delete never
 *    undoes a confirmed plan.
 *  - One transaction for the DB writes of a batch, so a failure leaves nothing
 *    partial. Stored-object removal is best-effort after commit; a session whose
 *    blobs could not be removed stays a retriable tombstone for the next run.
 *  - Prints host + counts only; never a user id, a filename, source text, or a
 *    draft. No personal data in operator output.
 */
import { Prisma, type PrismaClient } from "@prisma/client";

/** Terminal statuses whose stored sources should already be gone. */
const TERMINAL_STATUSES = [
  "confirmed",
  "discarded",
  "expired",
  "purged",
] as const;

export type CleanupPlan = {
  /** Unconfirmed sessions past their retention clock (would be purged). */
  expiredUnconfirmed: { id: string; objectPaths: string[] }[];
  /** Terminal sessions still tombstoned (blobs would be retried). */
  pendingTombstones: { id: string; objectPaths: string[] }[];
  /** The cutoff instant: a session with expiresAt before this is overdue. */
  nowIso: string;
};

type Db = Pick<
  PrismaClient,
  "importSession" | "importSourcePart" | "$transaction"
>;

async function objectPathsFor(
  db: Db,
  sessionIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (sessionIds.length === 0) return out;
  const parts = await db.importSourcePart.findMany({
    where: { sessionId: { in: sessionIds }, objectPath: { not: null } },
    select: { sessionId: true, objectPath: true },
  });
  for (const p of parts) {
    if (!p.objectPath) continue;
    const list = out.get(p.sessionId) ?? [];
    list.push(p.objectPath);
    out.set(p.sessionId, list);
  }
  return out;
}

/**
 * Compute the cleanup plan. Reads only; writes nothing. GLOBAL across accounts
 * (this is an operator task, not a request path) — it names its scope explicitly
 * and never infers an account.
 */
export async function planCleanup(
  db: Db,
  opts: { now?: Date } = {},
): Promise<CleanupPlan> {
  const now = opts.now ?? new Date();

  const overdue = await db.importSession.findMany({
    where: {
      expiresAt: { lt: now },
      status: { notIn: [...TERMINAL_STATUSES] },
    },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
  });
  const tombstoned = await db.importSession.findMany({
    where: {
      sourcesPurgedAt: null,
      status: { in: [...TERMINAL_STATUSES] },
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });

  const overdueIds = overdue.map((s) => s.id);
  const tombIds = tombstoned.map((s) => s.id);
  const overduePaths = await objectPathsFor(db, overdueIds);
  const tombPaths = await objectPathsFor(db, tombIds);

  return {
    expiredUnconfirmed: overdueIds.map((id) => ({
      id,
      objectPaths: overduePaths.get(id) ?? [],
    })),
    pendingTombstones: tombIds.map((id) => ({
      id,
      objectPaths: tombPaths.get(id) ?? [],
    })),
    nowIso: now.toISOString(),
  };
}

/**
 * Apply the plan. For expired-unconfirmed sessions: delete parts + draft and set
 * status `purged` in ONE transaction, then remove the stored objects best-effort
 * and stamp `sourcesPurgedAt` only on success. For tombstones: retry the stored-
 * object removal and stamp `sourcesPurgedAt` on success. A still-failing removal
 * leaves the session a retriable tombstone for the next run — it NEVER undoes a
 * confirmed plan. `removeObjects` is injected (the real one hits Storage); it is
 * best-effort and may throw per batch, which is caught here.
 */
export async function executeCleanup(
  db: Db,
  plan: CleanupPlan,
  removeObjects: (paths: string[]) => Promise<void>,
  now: Date = new Date(),
): Promise<{
  purged: number;
  tombstonesCleared: number;
  objectsFailed: number;
}> {
  let purged = 0;
  let tombstonesCleared = 0;
  let objectsFailed = 0;

  // 1) Expired, unconfirmed: DB writes in one transaction, then best-effort blobs.
  const expiredIds = plan.expiredUnconfirmed.map((s) => s.id);
  if (expiredIds.length > 0) {
    await db.$transaction(async (tx) => {
      await tx.importSourcePart.deleteMany({
        where: { sessionId: { in: expiredIds } },
      });
      await tx.importSession.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: "purged", draft: Prisma.DbNull, errorCode: null },
      });
    });
    purged = expiredIds.length;
    for (const s of plan.expiredUnconfirmed) {
      const ok = await tryRemove(removeObjects, s.objectPaths);
      if (ok) {
        await db.importSession.updateMany({
          where: { id: s.id, sourcesPurgedAt: null },
          data: { sourcesPurgedAt: now },
        });
      } else {
        objectsFailed += 1;
      }
    }
  }

  // 2) Terminal tombstones: retry the stored-object removal only.
  for (const s of plan.pendingTombstones) {
    const ok = await tryRemove(removeObjects, s.objectPaths);
    if (ok) {
      await db.importSession.updateMany({
        where: { id: s.id, sourcesPurgedAt: null },
        data: { sourcesPurgedAt: now },
      });
      tombstonesCleared += 1;
    } else {
      objectsFailed += 1;
    }
  }

  return { purged, tombstonesCleared, objectsFailed };
}

async function tryRemove(
  removeObjects: (paths: string[]) => Promise<void>,
  paths: string[],
): Promise<boolean> {
  if (paths.length === 0) return true;
  try {
    await removeObjects(paths);
    return true;
  } catch {
    return false;
  }
}

/** Operator-safe summary: counts only, never a user id, path, or content. */
export function formatPlan(plan: CleanupPlan): string {
  const expiredObjects = plan.expiredUnconfirmed.reduce(
    (n, s) => n + s.objectPaths.length,
    0,
  );
  const tombObjects = plan.pendingTombstones.reduce(
    (n, s) => n + s.objectPaths.length,
    0,
  );
  return [
    `Plan-import cleanup (cutoff ${plan.nowIso})`,
    `  expired unconfirmed sessions: ${plan.expiredUnconfirmed.length} (${expiredObjects} stored object(s))`,
    `  pending blob-delete tombstones: ${plan.pendingTombstones.length} (${tombObjects} stored object(s))`,
  ].join("\n");
}
