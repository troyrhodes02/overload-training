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

// The refusal messages and their classification live in the shared package
// (Pitch 21d RD-21), so the iPhone app shows the same words. Unchanged text.
export {
  SIGN_IN_UNAVAILABLE,
  signInErrorMessage,
  TOO_MANY_ATTEMPTS,
  WRONG_CREDENTIALS,
} from "@overload/shared/accounts/auth-errors";
