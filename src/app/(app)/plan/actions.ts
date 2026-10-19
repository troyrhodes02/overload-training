"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/data/account";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  activateMesocycle,
  archiveDraftMesocycle,
  cloneMesocycle,
  createMesocycle,
  updateMesocycleDetails,
} from "@/lib/plan/mesocycles";
import {
  addPlannedCardio,
  removePlannedCardio,
  updatePlannedCardio,
} from "@/lib/plan/cardio";
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
  deloadEveryWeeks: string;
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
    deloadEveryWeeks: get("deloadEveryWeeks"),
    splitType: get("splitType"),
  };
}

export async function createMesocycleAction(
  _prev: MesocycleFormState,
  formData: FormData,
): Promise<MesocycleFormState> {
  const account = await requireAccount();
  const values = formValues(formData);
  const result = await toActionResult(
    () => createMesocycle(account, values),
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
  const account = await requireAccount();
  const values = formValues(formData);
  const result = await toActionResult(
    () => updateMesocycleDetails(account, { mesocycleId, ...values }),
    "Couldn't save. Your entries are still here.",
  );
  if (result.ok) redirect(`/plan/${result.data.id}?saved=1`);
  return { result, values };
}

export async function activateMesocycleAction(input: {
  mesocycleId: string;
  expectedActiveId: string | null;
}): Promise<ActionResult<{ id: string; archivedId: string | null }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => activateMesocycle(account, input),
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
  const account = await requireAccount();
  // No refresh(): the client navigates to /plan, which renders fresh.
  return toActionResult(
    () => archiveDraftMesocycle(account, { mesocycleId }),
    "Couldn't archive. Nothing changed.",
  );
}

export async function addSessionAction(input: {
  mesocycleId: string;
  name: string;
  dayOfWeek: number | null;
  replace?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => addSession(account, input),
    "Couldn't add the session. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function renameSessionAction(input: {
  sessionId: string;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => renameSession(account, input),
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
  const account = await requireAccount();
  const result = await toActionResult(
    () => moveSession(account, input),
    "Couldn't move the session. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function removeSessionAction(
  sessionId: string,
): Promise<ActionResult<{ id: string; mesocycleId: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => removeSession(account, { sessionId }),
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
  const account = await requireAccount();
  const result = await toActionResult(
    () => addSessionExercise(account, input),
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
  const account = await requireAccount();
  const result = await toActionResult(
    () => updateSessionExercise(account, input),
    "Couldn't save. Your numbers are still here.",
  );
  if (result.ok) refresh();
  return result;
}

export async function replaceSessionExerciseAction(input: {
  sessionExerciseId: string;
  exerciseId: string;
}): Promise<ActionResult<{ id: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => replaceSessionExercise(account, input),
    "Couldn't replace. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function removeSessionExerciseAction(
  sessionExerciseId: string,
): Promise<ActionResult<{ id: string; sessionId: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => removeSessionExercise(account, { sessionExerciseId }),
    "Couldn't remove. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function moveSessionExerciseAction(input: {
  sessionExerciseId: string;
  direction: "up" | "down";
}): Promise<ActionResult<{ id: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => moveSessionExercise(account, input),
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
  const account = await requireAccount();
  const result = await toActionResult(
    () => duplicateSession(account, input),
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
  const account = await requireAccount();
  const values = formValues(formData);
  const result = await toActionResult(
    () => cloneMesocycle(account, { sourceMesocycleId, ...values }),
    "Couldn't create the clone. Your entries are still here.",
  );
  if (result.ok) redirect(`/plan/${result.data.id}?cloned=1`);
  return { result, values };
}

/*
 * Planned cardio (Cardio Logging). Plan authoring only: these never read or
 * write a CardioLog, so editing or removing the plan can't change history.
 */

export async function addPlannedCardioAction(input: {
  mesocycleId: string;
  dayOfWeek: number;
  type: string;
  durationMin: string;
}): Promise<ActionResult<{ id: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => addPlannedCardio(account, input),
    "Couldn't add cardio. Your entries are still here.",
  );
  if (result.ok) refresh();
  return result;
}

export async function updatePlannedCardioAction(input: {
  plannedCardioId: string;
  dayOfWeek: number;
  type: string;
  durationMin: string;
}): Promise<ActionResult<{ id: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => updatePlannedCardio(account, input),
    "Couldn't save. Your entries are still here.",
  );
  if (result.ok) refresh();
  return result;
}

export async function removePlannedCardioAction(
  plannedCardioId: string,
): Promise<ActionResult<{ id: string; mesocycleId: string }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    () => removePlannedCardio(account, { plannedCardioId }),
    "Couldn't remove. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}
