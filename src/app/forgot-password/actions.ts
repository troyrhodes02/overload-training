"use server";

import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkEmail } from "@/lib/accounts/validation";

export type ForgotState = {
  status: "idle" | "sent" | "invalid";
  email: string;
  error: string | null;
};

/**
 * Starts recovery (Accounts spec §11, R14, R23). For ANY well-formed email the
 * answer is the same "sent" state, returned BEFORE the auth service is asked:
 * the request runs after the response (`after`), so neither the wording nor
 * the timing depends on whether the address has an account, whether the
 * service rate-limited it (it only does that for known addresses), or how
 * long the email takes to send. Failures are logged by code only — never the
 * address.
 */
export async function requestPasswordResetAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const raw = formData.get("email");
  const email = checkEmail(raw);
  if (!email.ok) {
    return {
      status: "invalid",
      email: typeof raw === "string" ? raw : "",
      error: email.message,
    };
  }

  // The auth client is built now (it reads the request's cookies); the
  // request itself goes out once the response has been sent.
  const supabase = await createServerSupabase();
  after(async () => {
    try {
      // The recovery email template links to /auth/confirm on the Site URL.
      const { error } = await supabase.auth.resetPasswordForEmail(email.value);
      if (error) {
        console.error(
          `password reset request not sent (${error.code ?? error.status ?? "unknown"})`,
        );
      }
    } catch {
      console.error("password reset request not sent (unreachable)");
    }
  });

  return { status: "sent", email: email.value, error: null };
}
