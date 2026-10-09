"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  activateMesocycle,
  archiveDraftMesocycle,
  createMesocycle,
  updateMesocycleDetails,
} from "@/lib/plan/mesocycles";
import {
  addSession,
  moveSession,
  removeSession,
  renameSession,
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
  if (result.ok) refresh();
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
