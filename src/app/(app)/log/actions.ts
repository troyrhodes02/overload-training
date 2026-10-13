"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  changeGym,
  completeWorkout,
  startOrResumeWorkout,
  swapExercise,
} from "@/lib/logging/sessions";
import { logSet, type LogSetInput } from "@/lib/logging/logged-sets";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";

/*
 * Guided Workout Logging server actions. Each re-checks the auth session FIRST,
 * then calls a write module. LoggedSet writes flow only through
 * src/lib/logging/logged-sets.ts; no action writes the plan template.
 *
 * Goals (Pitch 6, spec §11b): after a set or a workout has COMMITTED, goal
 * completion is reconciled best-effort — outside the logging transaction, so a
 * goal problem can never fail or roll back a logged set (R30).
 */

export async function startWorkoutAction(input: {
  sessionId: string;
  scheduledFor: string;
  gymId: string;
}): Promise<ActionResult<{ loggedSessionId: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => startOrResumeWorkout(input),
    "Couldn't start the workout. Nothing was changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function changeGymAction(input: {
  loggedSessionId: string;
  gymId: string;
}): Promise<ActionResult<{ ok: true }>> {
  await requireUser();
  const result = await toActionResult(async () => {
    await changeGym(input);
    return { ok: true as const };
  }, "Couldn't change the gym.");
  if (result.ok) refresh();
  return result;
}

export async function logSetAction(
  input: LogSetInput,
): Promise<ActionResult<{ setId: string }>> {
  await requireUser();
  const result = await toActionResult(
    async () => ({ setId: (await logSet(input)).id }),
    "Couldn't save. Your numbers are still here.",
  );
  if (result.ok) {
    await reconcileGoalCompletionsSafely();
    refresh();
  }
  return result;
}

export async function swapExerciseAction(input: {
  loggedExerciseId: string;
  newExerciseId: string;
}): Promise<ActionResult<{ ok: true }>> {
  await requireUser();
  const result = await toActionResult(async () => {
    await swapExercise(input);
    return { ok: true as const };
  }, "Couldn't swap the exercise.");
  if (result.ok) refresh();
  return result;
}

export async function completeWorkoutAction(input: {
  loggedSessionId: string;
}): Promise<ActionResult<{ ok: true }>> {
  await requireUser();
  const result = await toActionResult(async () => {
    await completeWorkout(input);
    return { ok: true as const };
  }, "Couldn't finish the workout.");
  if (result.ok) {
    await reconcileGoalCompletionsSafely();
    refresh();
  }
  return result;
}

/**
 * Resolve a missed planned day as shifted or skipped (Resolved Decisions 31–39).
 * "Log it late" is not routed here — it starts the LoggedSession for the missed
 * occurrence (via startWorkoutAction with scheduledFor = missedOn), which is the
 * real training record and resolves the missed-day detection on its own.
 */
export async function resolveMissedDayAction(input: {
  mesocycleId: string;
  missedOn: string;
  outcome: "shifted" | "skipped";
}): Promise<ActionResult<{ ok: true }>> {
  await requireUser();
  const result = await toActionResult(async () => {
    await resolveMissedDay(input);
    return { ok: true as const };
  }, "Couldn't resolve the missed day.");
  if (result.ok) refresh();
  return result;
}
