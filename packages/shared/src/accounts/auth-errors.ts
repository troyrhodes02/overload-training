/**
 * One classification of a password sign-in refusal, shared by login and the
 * deletion password check (Accounts review fix): the same auth-service answer
 * must mean the same thing on every screen. Pure; no Supabase import.
 */

export type SignInErrorKind = "wrong" | "rate_limited" | "unavailable";

export function classifySignInError(error: {
  code?: string;
  status?: number;
}): SignInErrorKind {
  if (error.status === 429 || /rate_limit/.test(error.code ?? "")) {
    return "rate_limited";
  }
  // An unknown email and a wrong password are the same answer, on purpose.
  if (
    error.code === "invalid_credentials" ||
    error.status === 400 ||
    error.status === 422
  ) {
    return "wrong";
  }
  return "unavailable";
}

/**
 * The sign-in refusal messages (moved from apps/web/src/app/login/credentials.ts
 * in Pitch 21d, unchanged, RD-21): the web login and the iPhone app show the
 * same words for the same answer. An unknown email and a wrong password are
 * the same message, so sign-in never reveals whether an account exists.
 */
export const WRONG_CREDENTIALS = "Wrong email or password.";
export const TOO_MANY_ATTEMPTS =
  "Too many attempts. Wait a minute and try again.";
export const SIGN_IN_UNAVAILABLE =
  "Couldn't sign in. Check your connection and try again.";

/** The message for a password sign-in refusal from the auth service. */
export function signInErrorMessage(error: {
  code?: string;
  status?: number;
}): string {
  const kind = classifySignInError(error);
  if (kind === "rate_limited") return TOO_MANY_ATTEMPTS;
  if (kind === "wrong") return WRONG_CREDENTIALS;
  return SIGN_IN_UNAVAILABLE;
}
