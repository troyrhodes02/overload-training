"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { editLoggedSet } from "@/lib/logging/logged-sets";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";

/*
 * History server actions. Past-log correction edits weight/reps only (Resolved
 * Decision 51). No deletion exists. Editing never replays gym baselines
 * (Decisions 53/54); the write module enforces that. After the edit commits,
 * goal completion is reconciled best-effort (Goals spec §11b): a corrected set
 * may complete an active goal; it never reopens a completed one.
 */
export async function editLoggedSetAction(input: {
  loggedSetId: string;
  weightLbs: number;
  reps: number;
}): Promise<ActionResult<{ ok: true }>> {
  await requireUser();
  const result = await toActionResult(async () => {
    await editLoggedSet(input);
    return { ok: true as const };
  }, "Couldn't update the set.");
  if (result.ok) {
    await reconcileGoalCompletionsSafely();
    refresh();
  }
  return result;
}
