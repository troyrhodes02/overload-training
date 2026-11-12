import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  confirmEmailVerificationLink,
  EMAIL_VERIFICATION_OTP_TYPES,
  type VerificationLinkAuth,
} from "@/lib/data/email-verification";

/**
 * GET /auth/confirm — the landing target for recovery and verification links
 * (Public Accounts spec §11, R3; design doc Screens 4–6). Reintroduces the
 * callback Accounts R28 removed when password recovery was dropped.
 *
 * Supabase Auth's recovery/verify templates link here with a one-time
 * `token_hash` and a `type`. This handler verifies the token on the server
 * (which, on success, establishes the short-lived auth session via cookies,
 * following the same `@supabase/ssr` cookie pattern as the proxy) and then
 * hands off by type:
 *
 *   - recovery                    → /reset-password  (choose a new password)
 *   - email / signup / email_change / magiclink (verification) → /verify-email
 *
 * Verification is RECORDED HERE, in the same request that verified the token
 * (OVE-121 / audit F-A1): `confirmEmailVerificationLink` marks the account
 * verified only when the token verified and the verified email matches the
 * account's current email. /verify-email only displays the
 * stored state and never writes. Recovery tokens never reach that function.
 *
 * It never throws to an error page. A missing, malformed, unknown, expired,
 * reused, or otherwise rejected token redirects to the matching expired state:
 *   - recovery  → /forgot-password?link=expired  (Screen 5's "send a new link")
 *   - verify    → /verify-email?error=expired     (Screen 6's expired card)
 * Nothing about the account is revealed, and no Supabase/token internals leak.
 *
 * `/auth/confirm` is a public path (R9); it runs with or without an existing
 * session.
 */

const RECOVERY_EXPIRED = "/forgot-password?link=expired";
const VERIFY_EXPIRED = "/verify-email?error=expired";

function isRecovery(type: string | null): boolean {
  return type === "recovery";
}

function isVerify(type: string | null): boolean {
  return type !== null && EMAIL_VERIFICATION_OTP_TYPES.has(type);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  const to = (path: string) =>
    NextResponse.redirect(new URL(path, request.url), 303);

  // Decide the destination/expired pair up front so an unknown or missing type
  // still has a safe landing; default to the recovery door (the first flow).
  const expired = isVerify(type) ? VERIFY_EXPIRED : RECOVERY_EXPIRED;

  if ((!isRecovery(type) && !isVerify(type)) || !tokenHash) {
    return to(expired);
  }

  if (type !== null && isVerify(type)) {
    try {
      const supabase = await createServerSupabase();
      const outcome = await confirmEmailVerificationLink(
        supabase.auth as unknown as VerificationLinkAuth,
        { type, tokenHash },
      );
      // A verified token always lands on /verify-email, which shows the STORED
      // state (verified, or not verified when the emails didn't match).
      return to(outcome === "invalid" ? VERIFY_EXPIRED : "/verify-email");
    } catch {
      return to(VERIFY_EXPIRED);
    }
  }

  // Recovery: unchanged. The session it establishes is for /reset-password
  // only and never marks an email verified.
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) return to(expired);
  } catch {
    return to(expired);
  }

  return to("/reset-password");
}
