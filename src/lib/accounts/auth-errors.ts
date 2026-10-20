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
