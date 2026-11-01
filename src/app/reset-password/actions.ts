"use server";

import { redirect } from "next/navigation";
import { setNewPassword } from "@/lib/accounts/recovery";

export type ResetState = {
  status: "idle" | "error" | "expired";
  fieldError: string | null;
  formError: string | null;
};

/**
 * Set a new password from a recovery auth session (Public Accounts spec §9;
 * design Screen 5). The module re-checks the session (not only the page): an
 * ordinary password session can never change the password without the old one.
 * On success every session ends and the lifter signs in with the new password.
 * Profile.status is never touched — suspension is enforced on the next request.
 */
export async function setNewPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const result = await setNewPassword({
    newPassword: formData.get("password"),
  });

  if (result.ok) {
    redirect("/login?notice=password-updated");
  }

  if (result.error.code === "expired") {
    return { status: "expired", fieldError: null, formError: null };
  }
  if (result.error.code === "validation_error") {
    return {
      status: "error",
      fieldError: result.error.message,
      formError: null,
    };
  }
  return { status: "error", fieldError: null, formError: result.error.message };
}
