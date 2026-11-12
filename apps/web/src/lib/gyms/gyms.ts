import "server-only";
import type { Gym } from "@prisma/client";
import { DomainError, isUuid } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
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
 *  - Every function takes the acting Account (Multi-User Foundation): another
 *    account's gym is "not found". Each also accepts an optional transaction
 *    client so callers compose.
 */

type Db = AccountTx;

async function requireExists(account: Account, id: string, tx?: Db) {
  const row = isUuid(id)
    ? await (tx ?? account.db).gym.findUnique({
        where: { id },
        select: { id: true },
      })
    : null;
  if (!row) throw new DomainError("not_found", "That gym doesn't exist.");
}

export async function createGym(
  account: Account,
  input: RawGymInput,
  tx?: Db,
): Promise<Gym> {
  const parsed = parseGymInput(input);
  if (!parsed.ok) {
    throw new DomainError(
      "validation_error",
      "Check the highlighted fields.",
      parsed.details,
    );
  }
  return (tx ?? account.db).gym.create({
    data: {
      userId: account.userId,
      name: parsed.value.name,
      address: parsed.value.address,
    },
  });
}

/** Archive (soft delete). Idempotent. Never deletes. */
export async function archiveGym(
  account: Account,
  input: { gymId: string },
  tx?: Db,
): Promise<{ id: string }> {
  await requireExists(account, input.gymId, tx);
  await (tx ?? account.db).gym.updateMany({
    where: { id: input.gymId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { id: input.gymId };
}

/** Undo of an archive (the archive toast's Undo, spec D30). Idempotent. */
export async function restoreGym(
  account: Account,
  input: { gymId: string },
  tx?: Db,
): Promise<{ id: string }> {
  await requireExists(account, input.gymId, tx);
  await (tx ?? account.db).gym.updateMany({
    where: { id: input.gymId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  return { id: input.gymId };
}
