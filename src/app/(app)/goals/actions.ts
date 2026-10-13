"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { createGoal, type CreateGoalResult } from "@/lib/goals/goals";
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
