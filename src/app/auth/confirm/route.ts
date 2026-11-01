import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

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
 *   - email / signup / email_change (verification) → /verify-email
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

/** Verification OTP types Supabase may send for email ownership. */
const VERIFY_TYPES: ReadonlySet<string> = new Set([
  "email",
  "signup",
  "email_change",
]);

function isRecovery(type: string | null): boolean {
  return type === "recovery";
}

function isVerify(type: string | null): boolean {
  return type !== null && VERIFY_TYPES.has(type);
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
  const success = isVerify(type) ? "/verify-email" : "/reset-password";

  if ((!isRecovery(type) && !isVerify(type)) || !tokenHash) {
    return to(expired);
  }

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

  return to(success);
}
