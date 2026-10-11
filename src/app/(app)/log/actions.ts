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

/*
 * Guided Workout Logging server actions. Each re-checks the auth session FIRST,
 * then calls a write module. LoggedSet writes flow only through
 * src/lib/logging/logged-sets.ts; no action writes the plan template.
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
  if (result.ok) refresh();
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
  if (result.ok) refresh();
  return result;
}
