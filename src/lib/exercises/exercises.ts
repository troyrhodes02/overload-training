import "server-only";
import type { Exercise, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";
import {
  parseCustomExerciseInput,
  type RawCustomExerciseInput,
} from "./validation";

/**
 * The Exercise write module (Library & Gyms Setup). Outside the catalog
 * import, Exercise rows are created and changed only here.
 *
 * Invariants:
 *  - No hard delete, ever. Archive sets `deletedAt`; logged history keeps
 *    referencing the row (FKs are onDelete: Restrict).
 *  - Archive/restore touch ONLY `deletedAt`; favorite state is kept (spec D11).
 *  - Custom exercises are created with no source id and no image (spec D7).
 *  - Every function accepts an optional transaction client so callers compose.
 */

type Db = Prisma.TransactionClient;

function db(tx?: Db): Db {
  return tx ?? prisma;
}

const NOT_FOUND = "That exercise doesn't exist.";

async function requireExists(id: string, tx?: Db) {
  const row = isUuid(id)
    ? await db(tx).exercise.findUnique({
        where: { id },
        select: { id: true, deletedAt: true },
      })
    : null;
  if (!row) throw new DomainError("not_found", NOT_FOUND);
  return row;
}

export async function createCustomExercise(
  input: RawCustomExerciseInput,
  tx?: Db,
): Promise<Exercise> {
  const parsed = parseCustomExerciseInput(input);
  if (!parsed.ok) {
    throw new DomainError(
      "validation_error",
      "Check the highlighted fields.",
      parsed.details,
    );
  }
  return db(tx).exercise.create({
    data: {
      name: parsed.value.name,
      primaryMuscle: parsed.value.primaryMuscle,
      secondaryMuscles: parsed.value.secondaryMuscles,
      equipmentType: parsed.value.equipmentType,
      isCustom: true,
      // No sourceId, no imageRef: custom exercises have no image (DB CHECK too).
    },
  });
}

/** Manual favorite toggle. Only active exercises can change favorite state. */
export async function setExerciseFavorite(
  input: { exerciseId: string; isFavorite: boolean },
  tx?: Db,
): Promise<{ id: string; isFavorite: boolean }> {
  if (typeof input.isFavorite !== "boolean") {
    throw new DomainError("validation_error", "Choose favorite or not.");
  }
  const { count } = isUuid(input.exerciseId)
    ? await db(tx).exercise.updateMany({
        where: { id: input.exerciseId, deletedAt: null },
        data: { isFavorite: input.isFavorite },
      })
    : { count: 0 };
  if (count === 0) {
    // Nothing active matched: say whether it's missing or archived.
    await requireExists(input.exerciseId, tx);
    throw new DomainError(
      "invalid_state_transition",
      "Archived exercises can't be favorited.",
    );
  }
  return { id: input.exerciseId, isFavorite: input.isFavorite };
}

/** Archive (soft delete). Idempotent. Never deletes; never touches favorites. */
export async function archiveExercise(
  input: { exerciseId: string },
  tx?: Db,
): Promise<{ id: string }> {
  await requireExists(input.exerciseId, tx);
  await db(tx).exercise.updateMany({
    where: { id: input.exerciseId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { id: input.exerciseId };
}

/** Undo of an archive (the archive toast's Undo, spec D30). Idempotent. */
export async function restoreExercise(
  input: { exerciseId: string },
  tx?: Db,
): Promise<{ id: string }> {
  await requireExists(input.exerciseId, tx);
  await db(tx).exercise.updateMany({
    where: { id: input.exerciseId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  return { id: input.exerciseId };
}
