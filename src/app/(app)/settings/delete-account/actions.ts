"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requireAccount } from "@/lib/data/account";
import { deleteAccount } from "@/lib/accounts/deletion";
import { verifyCurrentPassword } from "@/lib/accounts/password";
import { createServerSupabase } from "@/lib/supabase/server";

export type DeleteAccountState = {
  status: "idle" | "error";
  fieldError: string | null;
  formError: "nothing_deleted" | "identity_pending" | "rate_limited" | null;
};

const fail = (
  formError: DeleteAccountState["formError"],
  fieldError: string | null = null,
): DeleteAccountState => ({ status: "error", fieldError, formError });

/**
 * Permanently deletes the SIGNED-IN account (Accounts spec §11, R12, R13).
 * The account comes from the auth session and the email used to re-check the
 * password comes from the same session; the form carries only the password,
 * so nobody can name another account here.
 */
export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const account = await requireAccount();
  const user = await requireUser();

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return fail(null, "Enter your password to confirm.");
  }
  const check = await verifyCurrentPassword(user.email ?? "", password);
  if (check === "wrong") return fail(null, "That password isn't right.");
  if (check === "rate_limited") return fail("rate_limited");
  if (check !== "ok") return fail("nothing_deleted");

  let identityRemoved: boolean;
  try {
    ({ identityRemoved } = await deleteAccount(account));
  } catch (error) {
    console.error(
      "account deletion failed; nothing was deleted",
      error instanceof Error ? error.name : "unknown",
    );
    return fail("nothing_deleted");
  }
  if (!identityRemoved) {
    refresh(); // the inventory now reads "no training data"
    return fail("identity_pending");
  }

  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } catch {
    // The identity is gone; its sessions went with it. Cookies may linger
    // until the next request rejects them.
  }
  redirect("/login?notice=deleted");
}
