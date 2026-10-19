import "server-only";
import { Prisma } from "@prisma/client";
import { DomainError } from "@/lib/actions/result";
import { inAccountTx, type Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import { lockMesocycleForUpdate, type LockedMesocycle } from "@/lib/data/locks";

/**
 * Shared plumbing for the plan write modules (./mesocycles.ts, ./sessions.ts).
 * Writes no rows itself (the plan write-module guard still names exactly two
 * writers); it provides the transaction wrapper, the mesocycle row lock every
 * plan write takes, database-error mapping, and the one field-by-field copy
 * of a planned exercise used by both duplicate and clone.
 */

/** The acting account's scoped transaction client (Multi-User Foundation). */
export type Db = AccountTx;

/** Run in the caller's (account-scoped) transaction, or open one. */
export function inTx<T>(
  account: Account,
  tx: Db | undefined,
  run: (t: Db) => Promise<T>,
): Promise<T> {
  return inAccountTx(account, tx, run);
}

export function invalid(details: Record<string, string>): DomainError {
  return new DomainError(
    "validation_error",
    "Check the highlighted fields.",
    details,
  );
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

/**
 * Translates a database error raised by `run` into a friendly DomainError —
 * but ONLY when this module opened the transaction. Inside a caller's
 * transaction the error has already aborted it (Postgres 25P02 on the next
 * statement), so pretending it was a normal domain error would let a caller
 * carry on with a dead transaction; there the raw error propagates.
 */
export async function mapDbErrors<T>(
  tx: Db | undefined,
  run: () => Promise<T>,
  map: (error: unknown) => DomainError | null,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!tx) {
      const mapped = map(error);
      if (mapped) throw mapped;
    }
    throw error;
  }
}

export type { LockedMesocycle };

/**
 * Reads one of the acting account's mesocycles under a row lock (SELECT …
 * FOR UPDATE, src/lib/data/locks.ts), so a status check and the write that
 * depends on it can't interleave with an activation, an archive, or another
 * edit of the same block in another tab. Another account's mesocycle is "not
 * found", exactly like a missing one.
 */
export async function lockMesocycle(
  account: Account,
  mesocycleId: string,
  tx: Db,
): Promise<LockedMesocycle> {
  const row = await lockMesocycleForUpdate(account, tx, mesocycleId);
  if (!row) {
    throw new DomainError("not_found", "That mesocycle doesn't exist.");
  }
  return row;
}

const READ_ONLY =
  "Archived mesocycles are read-only. Clone it forward to change it.";

/** Locks a mesocycle for writing; archived ones are rejected. */
export async function requireEditableMesocycle(
  account: Account,
  mesocycleId: string,
  tx: Db,
): Promise<LockedMesocycle> {
  const row = await lockMesocycle(account, mesocycleId, tx);
  if (row.status === "archived") {
    throw new DomainError("invalid_state_transition", READ_ONLY);
  }
  return row;
}

export { READ_ONLY };

/** The plan content of one planned exercise — the only fields a copy carries. */
export type PlannedExerciseSource = {
  exerciseId: string;
  plannedSets: number;
  targetRepMin: number;
  targetRepMax: number;
};

/**
 * The single field-by-field copy of planned exercises (spec D26, D31), used by
 * both session duplication and clone-forward so a field added later can't be
 * copied by one path and dropped by the other. Positions are rewritten
 * 0..n-1 in the given order.
 */
export function plannedExerciseCopies(
  account: Account,
  sessionId: string,
  sources: PlannedExerciseSource[],
): Prisma.SessionExerciseCreateManyInput[] {
  return sources.map((s, i) => ({
    userId: account.userId,
    sessionId,
    exerciseId: s.exerciseId,
    position: i,
    plannedSets: s.plannedSets,
    targetRepMin: s.targetRepMin,
    targetRepMax: s.targetRepMax,
  }));
}

/** Selects exactly the copied fields, in plan order. */
export const plannedExerciseSourceSelect = {
  exerciseId: true,
  plannedSets: true,
  targetRepMin: true,
  targetRepMax: true,
} satisfies Prisma.SessionExerciseSelect;

/** Session order within a mesocycle: explicit position, then creation. */
export const sessionOrder = [
  { position: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.SessionOrderByWithRelationInput[];
