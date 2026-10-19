import "server-only";
import type { Exercise } from "@prisma/client";
import { DomainError, isUuid } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import {
  parseCustomExerciseInput,
  type RawCustomExerciseInput,
} from "./validation";

/**
 * The Exercise write module (Library & Gyms Setup; Multi-User Foundation).
 * Outside the catalog import, Exercise and ExerciseFavorite rows are created
 * and changed only here.
 *
 * Invariants:
 *  - No hard delete, ever. Archive sets `deletedAt`; logged history keeps
 *    referencing the row (FKs are onDelete: Restrict).
 *  - Library exercises are shared reference data and are NEVER written by the
 *    app: archive/restore reach only the acting account's custom exercises
 *    (a library or another account's id is "not found"; spec R13).
 *  - Favorites are per account (ExerciseFavorite); the shared
 *    Exercise.isFavorite column is never read or written (spec R12).
 *  - Archive/restore touch ONLY `deletedAt`; favorite state is kept (spec D11).
 *  - Custom exercises are created with no source id and no image (spec D7).
 *  - Every function takes the acting Account and accepts an optional
 *    transaction client so callers compose.
 */

type Db = AccountTx;

const NOT_FOUND = "That exercise doesn't exist.";

/** A library or own custom exercise (whatever the account can see). */
async function requireVisible(account: Account, id: string, tx?: Db) {
  const row = isUuid(id)
    ? await (tx ?? account.db).exercise.findUnique({
        where: { id },
        select: { id: true, deletedAt: true },
      })
    : null;
  if (!row) throw new DomainError("not_found", NOT_FOUND);
  return row;
}

/** One of the acting account's custom exercises; library rows are read-only. */
async function requireOwnCustom(account: Account, id: string, tx?: Db) {
  const row = isUuid(id)
    ? await (tx ?? account.db).exercise.findFirst({
        // The scoped client only shows custom rows that belong to the account.
        where: { id, isCustom: true },
        select: { id: true, deletedAt: true },
      })
    : null;
  if (!row) throw new DomainError("not_found", NOT_FOUND);
  return row;
}

export async function createCustomExercise(
  account: Account,
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
  return (tx ?? account.db).exercise.create({
    data: {
      userId: account.userId,
      name: parsed.value.name,
      primaryMuscle: parsed.value.primaryMuscle,
      secondaryMuscles: parsed.value.secondaryMuscles,
      equipmentType: parsed.value.equipmentType,
      isCustom: true,
      // No sourceId, no imageRef: custom exercises have no image (DB CHECK too).
    },
  });
}

/**
 * Manual favorite toggle for the acting account. Only active exercises can
 * change favorite state. Starring writes the account's ExerciseFavorite row,
 * never the shared exercise.
 */
export async function setExerciseFavorite(
  account: Account,
  input: { exerciseId: string; isFavorite: boolean },
  tx?: Db,
): Promise<{ id: string; isFavorite: boolean }> {
  if (typeof input.isFavorite !== "boolean") {
    throw new DomainError("validation_error", "Choose favorite or not.");
  }
  const db = tx ?? account.db;
  const exercise = await requireVisible(account, input.exerciseId, tx);
  if (exercise.deletedAt !== null) {
    throw new DomainError(
      "invalid_state_transition",
      "Archived exercises can't be favorited.",
    );
  }
  if (input.isFavorite) {
    // ON CONFLICT DO NOTHING: idempotent and race-free (a double tap or two
    // tabs can't fail). A scoped upsert can't be native — the account filter
    // makes its lookup non-unique — so it would race find-then-create.
    await db.exerciseFavorite.createMany({
      data: [{ userId: account.userId, exerciseId: exercise.id }],
      skipDuplicates: true,
    });
  } else {
    await db.exerciseFavorite.deleteMany({
      where: { exerciseId: exercise.id },
    });
  }
  return { id: exercise.id, isFavorite: input.isFavorite };
}

/** Archive (soft delete) a custom exercise. Idempotent. Never deletes. */
export async function archiveExercise(
  account: Account,
  input: { exerciseId: string },
  tx?: Db,
): Promise<{ id: string }> {
  const row = await requireOwnCustom(account, input.exerciseId, tx);
  await (tx ?? account.db).exercise.updateMany({
    where: { id: row.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { id: row.id };
}

/** Undo of an archive (the archive toast's Undo, spec D30). Idempotent. */
export async function restoreExercise(
  account: Account,
  input: { exerciseId: string },
  tx?: Db,
): Promise<{ id: string }> {
  const row = await requireOwnCustom(account, input.exerciseId, tx);
  await (tx ?? account.db).exercise.updateMany({
    where: { id: row.id, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  return { id: row.id };
}
