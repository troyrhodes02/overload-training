"use server";

import { headers } from "next/headers";
import { requestFingerprint } from "@/lib/accounts/request-fingerprint";
import { requestPasswordReset } from "@/lib/accounts/recovery";

export type ForgotState = {
  status: "idle" | "sent" | "invalid";
  email: string;
  /** The identical "sent" outcome echoes the typed email for display only. */
  error: string | null;
};

/**
 * Start recovery (Public Accounts spec §9, §12, D7; design Screen 3). The
 * module is the privacy core: a malformed email or a failed bot challenge is
 * reported (`invalid`) before any lookup; every other outcome — the account
 * exists, it does not, the service is slow, the limiter is tripped — resolves
 * to the IDENTICAL `sent` state. The email is echoed back for display only.
 */
export async function requestPasswordResetAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail : "";
  const result = await requestPasswordReset(
    {
      email: rawEmail,
      challengeToken: formData.get("challengeToken"),
    },
    { throttleKey: requestFingerprint(await headers()) },
  );

  if (!result.ok) {
    return { status: "invalid", email, error: result.error.message };
  }
  // Identical for every address: show the sent state with the typed email.
  return { status: "sent", email: email.trim().toLowerCase(), error: null };
}
