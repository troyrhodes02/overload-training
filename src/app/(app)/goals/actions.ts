"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  acknowledgeGoalCompletion,
  archiveGoal,
  createGoal,
  type CreateGoalResult,
} from "@/lib/goals/goals";
import { goalInputFromFormData } from "@/lib/goals/validation";

/*
 * Goals server actions. Each re-checks the auth session FIRST, then calls the
 * Goal write module (src/lib/goals/goals.ts) — the only Goal writer. No action
 * here touches logged history, gym baselines, or the plan.
 */

export type GoalFormState = {
  result: ActionResult<CreateGoalResult> | null;
  values: {
    exerciseId: string;
    gymId: string;
    targetWeightLbs: string;
    targetReps: string;
  };
};

export async function createGoalAction(
  _prev: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  await requireUser();
  const raw = goalInputFromFormData(formData);
  const result = await toActionResult(
    () => createGoal(raw),
    "Couldn't set the goal. Your numbers are still here.",
  );
  if (result.ok) {
    // An already-reached goal leads with its Goal-reached card — no toast.
    redirect(
      result.data.outcome === "completed"
        ? `/goals/${result.data.id}`
        : `/goals/${result.data.id}?created=1`,
    );
  }
  return {
    result,
    values: {
      exerciseId: String(raw.exerciseId ?? ""),
      gymId: String(raw.gymId ?? ""),
      targetWeightLbs: String(raw.targetWeightLbs ?? ""),
      targetReps: String(raw.targetReps ?? ""),
    },
  };
}

/** Manually retire an active goal (no undo; R9, R59). */
export async function archiveGoalAction(
  goalId: string,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  // No refresh(): the client navigates to /goals, which renders fresh.
  return toActionResult(
    () => archiveGoal({ goalId }),
    "Couldn't archive the goal. Nothing changed.",
  );
}

/** Dismiss the one-time "Goal reached" card (idempotent; R34, R58). */
export async function acknowledgeGoalCompletionAction(
  goalId: string,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => acknowledgeGoalCompletion({ goalId }),
    "Couldn't update the goal. Try again.",
  );
  if (result.ok) refresh();
  return result;
}
