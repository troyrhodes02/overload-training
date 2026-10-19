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
 * Afterwards every auth session of the account, this one included, is
 * signed out and the lifter signs in with the new password.
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
    const fieldError = newPasswordErrorFor(
      error as {
        code?: string;
        reasons?: readonly string[];
      },
    );
    if (!fieldError) {
      console.error(`password reset failed (${error.code ?? "unknown"})`);
    }
    return {
      status: "error",
      fieldError,
      formError: fieldError ? null : UNEXPECTED,
    };
  }

  // Every session ends, this one included (spec R26): the lifter signs in
  // again with the new password. A reset link opened by someone else can
  // therefore never leave them signed in to its owner's account.
  const { error: signOutError } = await supabase.auth.signOut({
    scope: "global",
  });
  if (signOutError) {
    console.error(
      `signing out after a reset failed (${signOutError.code ?? "unknown"})`,
    );
  }
  redirect("/login?notice=password-updated");
}
