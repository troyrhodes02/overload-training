"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { archiveGym, createGym, restoreGym } from "@/lib/gyms/gyms";
import { gymInputFromFormData } from "@/lib/gyms/validation";

/*
 * Gym server actions. Each one re-checks the auth session FIRST, then calls
 * the write module. No action here creates or touches a gym baseline.
 */

export type GymFormState = {
  result: ActionResult<{ id: string }> | null;
  values: { name: string; address: string };
};

export async function createGymAction(
  _prev: GymFormState,
  formData: FormData,
): Promise<GymFormState> {
  await requireUser();
  const raw = gymInputFromFormData(formData);
  const result = await toActionResult(
    async () => ({ id: (await createGym(raw)).id }),
    "Couldn't add the gym. Your entries are still here.",
  );
  if (result.ok) redirect("/gyms?created=1");
  return {
    result,
    values: {
      name: String(raw.name ?? ""),
      address: String(raw.address ?? ""),
    },
  };
}

export async function archiveGymAction(
  gymId: string,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => archiveGym({ gymId }),
    "Couldn't archive. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function restoreGymAction(
  gymId: string,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => restoreGym({ gymId }),
    "Couldn't restore. Try again.",
  );
  if (result.ok) refresh();
  return result;
}
