"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  parseCredentials,
  SIGN_IN_UNAVAILABLE,
  signInErrorMessage,
} from "./credentials";

export type SignInState = {
  error: string | null;
  email: string;
};

export async function signInAction(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = parseCredentials(formData);
  if (!parsed.ok) {
    return { error: parsed.message, email: parsed.email };
  }

  let failure: string | null = null;
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password,
    });
    if (error) failure = signInErrorMessage(error);
  } catch {
    // The auth service was unreachable; nothing about the account is known.
    failure = SIGN_IN_UNAVAILABLE;
  }

  if (failure) {
    // Do not leak Supabase internals; one plain message per failure class.
    return { error: failure, email: parsed.email };
  }

  redirect("/");
}

export async function signOutAction(): Promise<void> {
  // Server actions re-check auth independently, never relying only on routing.
  await requireUser();
  const supabase = await createServerSupabase();
  // Only THIS browser's session ends (OVE-124 / audit F-A4). The default scope
  // is global, which would also sign the lifter out on every other device —
  // including the phone app once it exists. Password recovery's global
  // sign-out (lib/accounts/recovery.ts) is deliberate and unchanged.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
