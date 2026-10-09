"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  activateMesocycle,
  archiveDraftMesocycle,
  cloneMesocycle,
  createMesocycle,
  updateMesocycleDetails,
} from "@/lib/plan/mesocycles";
import {
  addSession,
  addSessionExercise,
  duplicateSession,
  moveSession,
  moveSessionExercise,
  removeSession,
  removeSessionExercise,
  renameSession,
  replaceSessionExercise,
  updateSessionExercise,
} from "@/lib/plan/sessions";

/*
 * Plan server actions (Split & Mesocycle Builder). Each one re-checks the auth
 * session FIRST (never relying on the proxy or the layout), then calls a plan
 * write module. No action here touches logged history, goals, or baselines.
 */

export type MesocycleFormValues = {
  name: string;
  startDate: string;
  lengthWeeks: string;
  deloadWeek: string;
  splitType: string;
};

export type MesocycleFormState = {
  result: ActionResult<{ id: string }> | null;
  values: MesocycleFormValues;
};

function formValues(formData: FormData): MesocycleFormValues {
  const get = (k: string) => String(formData.get(k) ?? "");
  return {
    name: get("name"),
    startDate: get("startDate"),
    lengthWeeks: get("lengthWeeks"),
    deloadWeek: get("deloadWeek"),
    splitType: get("splitType"),
  };
}

export async function createMesocycleAction(
  _prev: MesocycleFormState,
  formData: FormData,
): Promise<MesocycleFormState> {
  await requireUser();
  const values = formValues(formData);
  const result = await toActionResult(
    () => createMesocycle(values),
    "Couldn't create the mesocycle. Your entries are still here.",
  );
  if (result.ok) redirect(`/plan/${result.data.id}?created=1`);
  return { result, values };
}

export async function updateMesocycleDetailsAction(
  mesocycleId: string,
  _prev: MesocycleFormState,
  formData: FormData,
): Promise<MesocycleFormState> {
  await requireUser();
  const values = formValues(formData);
  const result = await toActionResult(
    () => updateMesocycleDetails({ mesocycleId, ...values }),
    "Couldn't save. Your entries are still here.",
  );
  if (result.ok) redirect(`/plan/${result.data.id}?saved=1`);
  return { result, values };
}

export async function activateMesocycleAction(input: {
  mesocycleId: string;
  expectedActiveId: string | null;
}): Promise<ActionResult<{ id: string; archivedId: string | null }>> {
  await requireUser();
  const result = await toActionResult(
    () => activateMesocycle(input),
    "Couldn't activate. Nothing changed.",
  );
  // Also refresh when refused for a state reason (the active block changed,
  // or the plan stopped being ready): the page then re-renders with the
  // current active block and checklist, so a retry isn't stuck on stale data.
  if (
    result.ok ||
    result.error.code === "conflict" ||
    result.error.code === "invalid_state_transition"
  ) {
    refresh();
  }
  return result;
}

export async function archiveDraftMesocycleAction(
  mesocycleId: string,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  // No refresh(): the client navigates to /plan, which renders fresh.
  return toActionResult(
    () => archiveDraftMesocycle({ mesocycleId }),
    "Couldn't archive. Nothing changed.",
  );
}

export async function addSessionAction(input: {
  mesocycleId: string;
  name: string;
  dayOfWeek: number | null;
  replace?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => addSession(input),
    "Couldn't add the session. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function renameSessionAction(input: {
  sessionId: string;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => renameSession(input),
    "Couldn't rename. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function moveSessionAction(input: {
  sessionId: string;
  dayOfWeek: number | null;
  replace?: boolean;
}): Promise<ActionResult<{ id: string; displacedId: string | null }>> {
  await requireUser();
  const result = await toActionResult(
    () => moveSession(input),
    "Couldn't move the session. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function removeSessionAction(
  sessionId: string,
): Promise<ActionResult<{ id: string; mesocycleId: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => removeSession({ sessionId }),
    "Couldn't remove the session. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function addSessionExerciseAction(input: {
  sessionId: string;
  exerciseId: string;
  plannedSets: string;
  targetRepMin: string;
  targetRepMax: string;
}): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => addSessionExercise(input),
    "Couldn't add the exercise. Your numbers are still here.",
  );
  if (result.ok) refresh();
  return result;
}

export async function updateSessionExerciseAction(input: {
  sessionExerciseId: string;
  plannedSets: string;
  targetRepMin: string;
  targetRepMax: string;
}): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => updateSessionExercise(input),
    "Couldn't save. Your numbers are still here.",
  );
  if (result.ok) refresh();
  return result;
}

export async function replaceSessionExerciseAction(input: {
  sessionExerciseId: string;
  exerciseId: string;
}): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => replaceSessionExercise(input),
    "Couldn't replace. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function removeSessionExerciseAction(
  sessionExerciseId: string,
): Promise<ActionResult<{ id: string; sessionId: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => removeSessionExercise({ sessionExerciseId }),
    "Couldn't remove. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function moveSessionExerciseAction(input: {
  sessionExerciseId: string;
  direction: "up" | "down";
}): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => moveSessionExercise(input),
    "Couldn't reorder. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function duplicateSessionAction(input: {
  sessionId: string;
  dayOfWeek: number | null;
  replace?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => duplicateSession(input),
    "Couldn't duplicate the session. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function cloneMesocycleAction(
  sourceMesocycleId: string,
  _prev: MesocycleFormState,
  formData: FormData,
): Promise<MesocycleFormState> {
  await requireUser();
  const values = formValues(formData);
  const result = await toActionResult(
    () => cloneMesocycle({ sourceMesocycleId, ...values }),
    "Couldn't create the clone. Your entries are still here.",
  );
  if (result.ok) redirect(`/plan/${result.data.id}?cloned=1`);
  return { result, values };
}
