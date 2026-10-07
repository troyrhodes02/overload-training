"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { parseCredentials } from "./credentials";

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

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.email,
    password: parsed.password,
  });

  if (error) {
    // Do not leak Supabase internals; one plain message.
    return { error: "Wrong email or password.", email: parsed.email };
  }

  redirect("/");
}

export async function signOutAction(): Promise<void> {
  // Server actions re-check auth independently, never relying only on routing.
  await requireUser();
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
