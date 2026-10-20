import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * The single server-side auth chokepoint (Data Access Layer). Every protected
 * surface and every server action resolves the user through here, and never
 * trusts the client. Uses supabase.auth.getUser(), which validates the session
 * with the Auth server rather than trusting a raw cookie.
 */
export async function getAuthUser(): Promise<User | null> {
  // The session check is request-time work: getUser() calls the Auth server and
  // reads the clock (token expiry). With Cache Components + Partial
  // Prefetching, cookies() alone can resolve during the App Shell prerender,
  // where Date.now() is not allowed ("blocking-prerender-current-time"), so
  // defer explicitly to the request before touching Supabase.
  await connection();
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
