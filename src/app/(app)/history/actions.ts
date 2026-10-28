"use server";

import { refresh } from "next/cache";
import { requireAccount } from "@/lib/data/account";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { editLoggedSet } from "@/lib/logging/logged-sets";
import { editPlannedSets } from "@/lib/logging/sessions";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";
import { editCardioLog } from "@/lib/cardio/cardio-logs";

/*
 * History server actions. Past-log correction edits weight, reps, and RIR only
 * (Resolved Decision 51; RIR Logging R8). No deletion exists. Editing never replays gym baselines
 * (Decisions 53/54); the write module enforces that. After the edit commits,
 * goal completion is reconciled best-effort (Goals spec §11b): a corrected set
 * may complete an active goal; it never reopens a completed one.
 */
export async function editLoggedSetAction(input: {
  loggedSetId: string;
  /** Omit / null for a bodyweight exercise (reps only). */
  weightLbs?: number | null;
  reps: number;
  /** Omit to keep the stored RIR; null clears it (RIR Logging R9). */
  rir?: number | null;
}): Promise<ActionResult<{ ok: true }>> {
  const account = await requireAccount();
  const result = await toActionResult(async () => {
    await editLoggedSet(account, input);
    return { ok: true as const };
  }, "Couldn't update the set.");
  if (result.ok) {
    await reconcileGoalCompletionsSafely(account);
    refresh();
  }
  return result;
}

/**
 * Correct the planned-set target on one past logged exercise when the lifter
 * cut a set on purpose (the shorter count was the real plan that day). Lowering
 * it lets a complete-but-short session count toward progression again. Scoped to
 * the one LoggedExercise; the Session template is never touched. The tag is
 * computed on read, so the corrected session re-qualifies on refresh; goal
 * completion is reconciled best-effort, exactly as for a set correction.
 */
export async function editPlannedSetsAction(input: {
  loggedExerciseId: string;
  plannedSets: number;
}): Promise<ActionResult<{ ok: true }>> {
  const account = await requireAccount();
  const result = await toActionResult(async () => {
    await editPlannedSets(account, input);
    return { ok: true as const };
  }, "Couldn't update the planned sets.");
  if (result.ok) {
    await reconcileGoalCompletionsSafely(account);
    refresh();
  }
  return result;
}

/**
 * Correct a cardio entry's activity and minutes (Cardio Logging R32). No
 * delete exists. Nothing downstream reads cardio, so there is nothing to
 * reconcile (R34).
 */
export async function editCardioLogAction(input: {
  cardioLogId: string;
  type: string;
  durationMin: string;
}): Promise<ActionResult<{ id: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => editCardioLog(account, input),
    "Couldn't save. Your entries are still here.",
  );
  if (result.ok) refresh();
  return result;
}
