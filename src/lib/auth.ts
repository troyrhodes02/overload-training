import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { isRecoveryOnlySession, jwtPayload } from "@/lib/accounts/recovery";

/**
 * The single server-side auth chokepoint (Data Access Layer). Every protected
 * surface and every server action resolves the user through here, and never
 * trusts the client. Uses supabase.auth.getUser(), which validates the session
 * with the Auth server rather than trusting a raw cookie.
 */
async function readAuthSession(): Promise<{
  user: User | null;
  recoveryOnly: boolean;
}> {
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
  if (!user) return { user: null, recoveryOnly: false };
  // getUser() just validated this session's access token with the Auth
  // server, so reading its `amr` claim is safe.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    user,
    recoveryOnly: isRecoveryOnlySession(jwtPayload(session?.access_token)),
  };
}

export async function getAuthUser(): Promise<User | null> {
  return (await readAuthSession()).user;
}

/**
 * Returns the authenticated user or redirects to /login. A session that only
 * exists because a reset link was followed may set a password and nothing
 * else (Accounts spec R26): it is sent to /reset-password, so a reset link
 * opened by someone else never lets them act inside its owner's account.
 * Only sign-out passes `allowRecovery`.
 */
export async function requireUser(
  opts: { allowRecovery?: boolean } = {},
): Promise<User> {
  const { user, recoveryOnly } = await readAuthSession();
  if (!user) {
    redirect("/login");
  }
  if (recoveryOnly && !opts.allowRecovery) {
    redirect("/reset-password");
  }
  return user;
}
