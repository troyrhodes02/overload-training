"use server";

import { headers } from "next/headers";
import { requestPasswordReset } from "@/lib/accounts/recovery";

/**
 * A coarse request fingerprint for the recovery rate limiter (PA2/PA4, §9/R4).
 * The first client IP from the standard proxy headers, else a stable fallback
 * from the user-agent and language so a header-stripped request is still
 * limited. It is NEVER the email, so a rate-limit decision reveals no
 * membership; the throttle SHA-256-hashes it before it touches the database.
 * (Shared shape with signup's fingerprint.)
 */
async function requestFingerprint(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  if (ip) return `ip:${ip}`;
  const ua = h.get("user-agent")?.trim() ?? "";
  const lang = h.get("accept-language")?.trim() ?? "";
  return `ua:${ua}|${lang}`;
}

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
    { throttleKey: await requestFingerprint() },
  );

  if (!result.ok) {
    return { status: "invalid", email, error: result.error.message };
  }
  // Identical for every address: show the sent state with the typed email.
  return { status: "sent", email: email.trim().toLowerCase(), error: null };
}
