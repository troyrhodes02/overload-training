import "server-only";
import type { Gym, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";
import { parseGymInput, type RawGymInput } from "./validation";

/**
 * The Gym write module (Library & Gyms Setup).
 *
 * Invariants:
 *  - Creating a gym creates ONLY a Gym row. No GymExerciseBaseline is ever
 *    created here: baselines are established by logged training in Guided
 *    Workout Logging (spec D18).
 *  - No hard delete, ever. Archive sets `deletedAt`; logged history keeps
 *    referencing the row (FKs are onDelete: Restrict).
 *  - Every function accepts an optional transaction client so callers compose.
 */

type Db = Prisma.TransactionClient;

function db(tx?: Db): Db {
  return tx ?? prisma;
}

async function requireExists(id: string, tx?: Db) {
  const row = isUuid(id)
    ? await db(tx).gym.findUnique({ where: { id }, select: { id: true } })
    : null;
  if (!row) throw new DomainError("not_found", "That gym doesn't exist.");
}

export async function createGym(input: RawGymInput, tx?: Db): Promise<Gym> {
  const parsed = parseGymInput(input);
  if (!parsed.ok) {
    throw new DomainError(
      "validation_error",
      "Check the highlighted fields.",
      parsed.details,
    );
  }
  return db(tx).gym.create({
    data: { name: parsed.value.name, address: parsed.value.address },
  });
}

/** Archive (soft delete). Idempotent. Never deletes. */
export async function archiveGym(
  input: { gymId: string },
  tx?: Db,
): Promise<{ id: string }> {
  await requireExists(input.gymId, tx);
  await db(tx).gym.updateMany({
    where: { id: input.gymId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { id: input.gymId };
}

/** Undo of an archive (the archive toast's Undo, spec D30). Idempotent. */
export async function restoreGym(
  input: { gymId: string },
  tx?: Db,
): Promise<{ id: string }> {
  await requireExists(input.gymId, tx);
  await db(tx).gym.updateMany({
    where: { id: input.gymId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  return { id: input.gymId };
}
