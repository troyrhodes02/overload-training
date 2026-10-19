"use server";

import { refresh } from "next/cache";
import { requireAccount } from "@/lib/data/account";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { updateProfile } from "@/lib/accounts/profile";

/*
 * Settings server actions (Accounts spec §11). The acting account comes from
 * the auth session only; the form carries values, never an account id.
 */

export type ProfileFormState = {
  result: ActionResult<{ saved: true }> | null;
  values: { firstName: string; lastName: string; timeZone: string };
  /** The last values known saved (carried forward on failure). */
  saved: { firstName: string; lastName: string; timeZone: string };
};

export async function updateProfileAction(
  prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const account = await requireAccount();
  const raw = {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    timeZone: formData.get("timeZone"),
  };
  let stored: ProfileFormState["saved"] | null = null;
  const result = await toActionResult(async () => {
    stored = await updateProfile(account, raw);
    return { saved: true as const };
  }, "Couldn't save. Your changes are still here.");
  if (result.ok) refresh();
  return {
    result,
    values: {
      firstName: String(raw.firstName ?? ""),
      lastName: String(raw.lastName ?? ""),
      timeZone: String(raw.timeZone ?? ""),
    },
    saved: stored ?? prev.saved,
  };
}
