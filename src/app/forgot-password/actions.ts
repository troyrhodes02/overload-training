"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { checkEmail } from "@/lib/accounts/validation";
import { RESET_REQUEST_MIN_MS } from "@/lib/accounts/recovery";

export type ForgotState = {
  status: "idle" | "sent" | "invalid";
  email: string;
  error: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts recovery (Accounts spec §11, R14). For ANY well-formed email the
 * answer is the same "sent" state, in at least RESET_REQUEST_MIN_MS: whether
 * the address has an account, the auth service rate-limited it (it only does
 * that for known addresses), or the service failed. Failures are logged by
 * code only — never the address.
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

  const request = (async () => {
    try {
      const supabase = await createServerSupabase();
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
  })();
  await Promise.all([request, sleep(RESET_REQUEST_MIN_MS)]);

  return { status: "sent", email: email.value, error: null };
}
