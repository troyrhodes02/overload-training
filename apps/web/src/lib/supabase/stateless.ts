import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A cookie-less, per-request ANON Supabase client for the mobile API's account
 * routes (Pitch 21d spec §10.2, §10.5). AUTH ONLY: it signs a just-created
 * account in (to hand the app its session) and asks Supabase Auth to send a
 * recovery email. It never queries an application table, never persists or
 * shares a session between requests, and never uses the service-role key.
 *
 * Returns null when the public Supabase variables are missing, so callers
 * fail closed instead of throwing during a request.
 */
export function createStatelessAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }).auth;
}

export type StatelessAuthClient = NonNullable<
  ReturnType<typeof createStatelessAuthClient>
>;
