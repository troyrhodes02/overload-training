"use server";

import { refresh } from "next/cache";
import { requireAccount } from "@/lib/data/account";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  changeGym,
  completeWorkout,
  setExerciseSkipped,
  startOrResumeWorkout,
  swapExercise,
} from "@/lib/logging/sessions";
import { logSet, type LogSetInput } from "@/lib/logging/logged-sets";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";
import { logCardio } from "@/lib/cardio/cardio-logs";

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
  const account = await requireAccount();
  const result = await toActionResult(
    () => startOrResumeWorkout(account, input),
    "Couldn't start the workout. Nothing was changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function changeGymAction(input: {
  loggedSessionId: string;
  gymId: string;
}): Promise<ActionResult<{ ok: true }>> {
  const account = await requireAccount();
  const result = await toActionResult(async () => {
    await changeGym(account, input);
    return { ok: true as const };
  }, "Couldn't change the gym.");
  if (result.ok) refresh();
  return result;
}

export async function logSetAction(
  input: LogSetInput,
): Promise<ActionResult<{ setId: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    async () => ({ setId: (await logSet(account, input)).id }),
    "Couldn't save. Your numbers are still here.",
  );
  if (result.ok) {
    await reconcileGoalCompletionsSafely(account);
    refresh();
  }
  return result;
}

export async function swapExerciseAction(input: {
  loggedExerciseId: string;
  newExerciseId: string;
}): Promise<ActionResult<{ ok: true }>> {
  const account = await requireAccount();
  const result = await toActionResult(async () => {
    await swapExercise(account, input);
    return { ok: true as const };
  }, "Couldn't swap the exercise.");
  if (result.ok) refresh();
  return result;
}

/** Mark a planned exercise "Didn't do" (no sets yet), or undo that. */
export async function setExerciseSkippedAction(input: {
  loggedExerciseId: string;
  skipped: boolean;
}): Promise<ActionResult<{ ok: true }>> {
  const account = await requireAccount();
  const result = await toActionResult(async () => {
    await setExerciseSkipped(account, input);
    return { ok: true as const };
  }, "Couldn't update the exercise.");
  if (result.ok) refresh();
  return result;
}

export async function completeWorkoutAction(input: {
  loggedSessionId: string;
}): Promise<ActionResult<{ ok: true }>> {
  const account = await requireAccount();
  const result = await toActionResult(async () => {
    await completeWorkout(account, input);
    return { ok: true as const };
  }, "Couldn't finish the workout.");
  if (result.ok) {
    await reconcileGoalCompletionsSafely(account);
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
  const account = await requireAccount();
  const result = await toActionResult(async () => {
    await resolveMissedDay(account, input);
    return { ok: true as const };
  }, "Couldn't resolve the missed day.");
  if (result.ok) refresh();
  return result;
}

/**
 * Record the cardio actually done for one planned occurrence (Cardio
 * Logging). Idempotent: a retry returns the existing record with
 * `alreadyLogged`. Cardio is a record only — no goal reconciliation, no
 * progression, no baseline (R34, R71).
 */
export async function logCardioAction(input: {
  mesocycleId: string;
  scheduledFor: string;
  type: string;
  durationMin: string;
}): Promise<ActionResult<{ cardioLogId: string; alreadyLogged: boolean }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => logCardio(account, input),
    "Couldn't save. Your entries are still here.",
  );
  if (result.ok) refresh();
  return result;
}
