import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * The single server-side auth chokepoint (Data Access Layer). Every protected
 * surface and every server action resolves the user through here, and never
 * trusts the client. Uses supabase.auth.getUser(), which validates the session
 * with the Auth server rather than trusting a raw cookie.
 */
export async function getAuthUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/** Returns the authenticated user or redirects to /login. */
export async function requireUser(): Promise<User> {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
