import "server-only";
import type { Account } from "@/lib/data/account";
import {
  editLoggedSet,
  logSet,
  type EditLoggedSetInput,
  type LogSetInput,
} from "@/lib/logging/logged-sets";
import { completeWorkout, editPlannedSets } from "@/lib/logging/sessions";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";

/**
 * Logging writes that can complete a goal (Pitch 21c spec §10; audit S-4 /
 * F-T12): each runs its write — in the write's own transaction — and THEN,
 * after that transaction has committed, the one goal-completion engine. This
 * is the only place that pairing lives, so the web's server actions and the
 * mobile handlers (21e) cannot forget it or run it inside a set's transaction.
 *
 * None of them takes a caller's transaction: the reconciliation must read the
 * committed write, so composing these inside a transaction would be wrong.
 *
 * Unchanged semantics: a failed write throws before any reconciliation; the
 * reconciliation is best-effort and never fails the write (Goals R30). A
 * static guard keeps `reconcileGoalCompletionsSafely` out of server actions.
 */

export async function logSetAndReconcile(
  account: Account,
  input: LogSetInput,
): Promise<Awaited<ReturnType<typeof logSet>>> {
  const set = await logSet(account, input);
  await reconcileGoalCompletionsSafely(account);
  return set;
}

export async function completeWorkoutAndReconcile(
  account: Account,
  input: { loggedSessionId: string },
): Promise<void> {
  await completeWorkout(account, input);
  await reconcileGoalCompletionsSafely(account);
}

export async function editLoggedSetAndReconcile(
  account: Account,
  input: EditLoggedSetInput,
): Promise<Awaited<ReturnType<typeof editLoggedSet>>> {
  const result = await editLoggedSet(account, input);
  await reconcileGoalCompletionsSafely(account);
  return result;
}

export async function editPlannedSetsAndReconcile(
  account: Account,
  input: { loggedExerciseId: string; plannedSets: number },
): Promise<void> {
  await editPlannedSets(account, input);
  await reconcileGoalCompletionsSafely(account);
}
