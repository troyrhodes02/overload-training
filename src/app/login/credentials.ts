/** Pure input parsing for the login form, unit-testable without Supabase. */
export type ParsedCredentials =
  | { ok: true; email: string; password: string }
  | { ok: false; email: string; message: string };

export function parseCredentials(formData: FormData): ParsedCredentials {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, email, message: "Enter your email and password." };
  }
  return { ok: true, email, password };
}

export const WRONG_CREDENTIALS = "Wrong email or password.";
export const TOO_MANY_ATTEMPTS =
  "Too many attempts. Wait a minute and try again.";
export const SIGN_IN_UNAVAILABLE =
  "Couldn't sign in. Check your connection and try again.";

/**
 * The one message per failure class (Accounts design doc Screen 1). An unknown
 * email and a wrong password are the same message, so login never reveals
 * whether an address has an account. Supabase internals never reach the page.
 */
export function signInErrorMessage(error: {
  code?: string;
  status?: number;
}): string {
  if (error.status === 429 || /rate_limit/.test(error.code ?? "")) {
    return TOO_MANY_ATTEMPTS;
  }
  if (
    error.code === "invalid_credentials" ||
    error.status === 400 ||
    error.status === 422
  ) {
    return WRONG_CREDENTIALS;
  }
  return SIGN_IN_UNAVAILABLE;
}
