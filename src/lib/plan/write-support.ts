import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";

/**
 * Shared plumbing for the plan write modules (./mesocycles.ts, ./sessions.ts).
 * Writes no rows itself (the plan write-module guard still names exactly two
 * writers); it provides the transaction wrapper, the mesocycle row lock every
 * plan write takes, database-error mapping, and the one field-by-field copy
 * of a planned exercise used by both duplicate and clone.
 */

export type Db = Prisma.TransactionClient;

/** Run in the caller's transaction, or open one. */
export function inTx<T>(
  tx: Db | undefined,
  run: (t: Db) => Promise<T>,
): Promise<T> {
  return tx ? run(tx) : prisma.$transaction(run);
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

export type LockedMesocycle = {
  id: string;
  status: "draft" | "active" | "archived";
};

/**
 * Reads a mesocycle's status under a row lock (SELECT … FOR UPDATE), so a
 * status check and the write that depends on it can't interleave with an
 * activation, an archive, or another edit of the same block in another tab:
 * the second transaction waits, then sees the committed status.
 */
export async function lockMesocycle(
  mesocycleId: string,
  tx: Db,
): Promise<LockedMesocycle> {
  const rows = isUuid(mesocycleId)
    ? await tx.$queryRaw<LockedMesocycle[]>`
        SELECT "id", "status"::text AS "status" FROM "mesocycles"
        WHERE "id" = ${mesocycleId}::uuid FOR UPDATE`
    : [];
  if (rows.length === 0) {
    throw new DomainError("not_found", "That mesocycle doesn't exist.");
  }
  return rows[0];
}

const READ_ONLY =
  "Archived mesocycles are read-only. Clone it forward to change it.";

/** Locks a mesocycle for writing; archived ones are rejected. */
export async function requireEditableMesocycle(
  mesocycleId: string,
  tx: Db,
): Promise<LockedMesocycle> {
  const row = await lockMesocycle(mesocycleId, tx);
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
  sessionId: string,
  sources: PlannedExerciseSource[],
): Prisma.SessionExerciseCreateManyInput[] {
  return sources.map((s, i) => ({
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
