"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  isRecoverySessionNow,
  newPasswordErrorFor,
  PASSWORD_ERRORS,
} from "@/lib/accounts/recovery";

export type ResetState = {
  status: "idle" | "error" | "expired";
  fieldError: string | null;
  formError: string | null;
};

const UNEXPECTED = "Couldn't set your password. Try again, or send a new link.";

/**
 * Sets a new password from a recovery auth session (Accounts spec §11, R8).
 * The session is re-checked here, not only on the page: an ordinary
 * password session can never change the password without the old one.
 * Afterwards every other auth session of the account is signed out.
 */
export async function setNewPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  if (!isRecoverySessionNow(data?.claims)) {
    return { status: "expired", fieldError: null, formError: null };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return {
      status: "error",
      fieldError: PASSWORD_ERRORS.missing,
      formError: null,
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const fieldError = newPasswordErrorFor(error.code);
    if (!fieldError) {
      console.error(`password reset failed (${error.code ?? "unknown"})`);
    }
    return {
      status: "error",
      fieldError,
      formError: fieldError ? null : UNEXPECTED,
    };
  }

  const { error: signOutError } = await supabase.auth.signOut({
    scope: "others",
  });
  if (signOutError) {
    console.error(
      `signing out other sessions failed (${signOutError.code ?? "unknown"})`,
    );
  }
  redirect("/?notice=password-updated");
}
