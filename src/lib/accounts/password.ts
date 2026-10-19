import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Re-checks the signed-in lifter's password before account deletion
 * (Accounts spec R13). Uses a throwaway, cookie-less client so the check never
 * touches the browser's auth session; the session the check creates is
 * revoked straight away. The email comes from the caller's auth session —
 * never from a form.
 */
export async function verifyCurrentPassword(
  email: string,
  password: string,
): Promise<"ok" | "wrong" | "rate_limited" | "unavailable"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !email || !password) return "unavailable";
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      if (error.status === 429 || /rate_limit/.test(error.code ?? "")) {
        return "rate_limited";
      }
      if (error.code === "invalid_credentials" || error.status === 400) {
        return "wrong";
      }
      return "unavailable";
    }
    if (data.session) {
      await client.auth.signOut({ scope: "local" }).catch(() => {});
    }
    return "ok";
  } catch {
    return "unavailable";
  }
}
