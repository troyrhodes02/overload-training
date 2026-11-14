import "server-only";
import {
  createClient,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";

/**
 * Bearer-token verification for the mobile API (Pitch 21c spec §7.1). AUTH
 * ONLY: this client never queries an application table.
 *
 * The token is checked by ASKING the Supabase Auth server (`getUser(token)`),
 * never by decoding or verifying the JWT locally. The Auth server refuses an
 * expired token, a token whose session was signed out, and a token for a user
 * that no longer exists — which a local check would accept for up to an hour
 * (mobile audit F-A6).
 *
 * A fresh cookie-less ANON client per call: no session is persisted, refreshed,
 * or shared between requests, and the service-role key is never used.
 */

export type TokenVerdict =
  | { kind: "user"; userId: string; email: string }
  /** The Auth server answered: this token is not valid now. */
  | { kind: "rejected" }
  /** The Auth server could not be reached or failed; the token is unknown. */
  | { kind: "unavailable" };

export async function verifyAccessToken(token: string): Promise<TokenVerdict> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { kind: "unavailable" };
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error) return classifyAuthError(error);
    const user = data.user;
    // Email-and-password accounts always have an email; anything else is not
    // an Overload account.
    if (!user || typeof user.email !== "string" || user.email === "") {
      return { kind: "rejected" };
    }
    return { kind: "user", userId: user.id, email: user.email };
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * A refusal from the Auth server (any auth error with a 4xx status) means the
 * token is bad. That includes a session that was signed out or revoked, which
 * supabase-js reports as AuthSessionMissingError (status 400) rather than an
 * AuthApiError — found by the live check against overload-dev. A network
 * failure or a 5xx means we don't know, and the lifter must not be signed out
 * for our outage (RD-6).
 */
export function classifyAuthError(error: unknown): TokenVerdict {
  if (isAuthRetryableFetchError(error)) return { kind: "unavailable" };
  if (isAuthSessionMissingError(error)) return { kind: "rejected" };
  if (isAuthError(error)) {
    const status = error.status ?? 0;
    return status >= 400 && status < 500
      ? { kind: "rejected" }
      : { kind: "unavailable" };
  }
  return { kind: "unavailable" };
}
