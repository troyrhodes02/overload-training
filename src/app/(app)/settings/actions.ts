"use server";

import { refresh } from "next/cache";
import { requireAccount } from "@/lib/data/account";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { updateProfile } from "@/lib/accounts/profile";
import type { ProfileInput } from "@/lib/accounts/validation";
import { updateAppearance } from "@/lib/accounts/appearance";
import type { Appearance } from "@/lib/appearance/appearance";

/*
 * Settings server actions (Accounts spec §11). The acting account comes from
 * the auth session only; the form carries values, never an account id.
 */

export type ProfileFormState = {
  result: ActionResult<{ saved: true }> | null;
  values: ProfileInput;
  /** The last values known saved (carried forward on failure). */
  saved: ProfileInput;
};

export async function updateProfileAction(
  prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const account = await requireAccount();
  const raw = {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    username: formData.get("username"),
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
      username: String(raw.username ?? ""),
      timeZone: String(raw.timeZone ?? ""),
    },
    saved: stored ?? prev.saved,
  };
}

/**
 * Saves the acting account's appearance (Personalization & Navigation Polish,
 * spec §11). The client has already applied the choice; this persists it. The
 * only input is the value — the account comes from the auth session. On
 * success the layout re-renders so the shell receives the stored value.
 */
export async function updateAppearanceAction(
  appearance: unknown,
): Promise<ActionResult<{ appearance: Appearance }>> {
  const account = await requireAccount();
  const result = await toActionResult(
    async () => ({ appearance: await updateAppearance(account, appearance) }),
    "Couldn't save your appearance. Try again.",
  );
  if (result.ok) refresh();
  return result;
}
