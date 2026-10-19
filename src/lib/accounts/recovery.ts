/**
 * Password recovery rules (Accounts spec §5, R7, R8, R14). Pure, so both the
 * pages and the actions share one definition and tests need no Supabase.
 */

/**
 * How long after following a reset link the lifter may set a new password
 * without knowing the old one. The link itself expires after an hour
 * (Supabase `otp_expiry`); this bounds the session it creates.
 */
export const RECOVERY_SESSION_MAX_AGE_SECONDS = 1800;

/**
 * The floor on how long a reset request takes to answer, so a known address
 * (whose email is sent before the auth service replies) and an unknown one
 * respond in the same time as well as with the same words.
 */
export const RESET_REQUEST_MIN_MS = 1500;

type AmrEntry = { method?: unknown; timestamp?: unknown };

/**
 * A recovery auth session: its JWT `amr` records an `otp` (Supabase's method
 * for a verified recovery token_hash) or `recovery` sign-in within the
 * window. A password sign-in records `password`, so an ordinary session never
 * qualifies. Overload has no other OTP or magic-link sign-in.
 */
export function isRecoverySession(
  claims: { amr?: unknown } | null | undefined,
  nowSeconds: number,
): boolean {
  if (!claims || !Array.isArray(claims.amr)) return false;
  return (claims.amr as AmrEntry[]).some(
    (entry) =>
      (entry.method === "otp" || entry.method === "recovery") &&
      typeof entry.timestamp === "number" &&
      nowSeconds - entry.timestamp >= 0 &&
      nowSeconds - entry.timestamp <= RECOVERY_SESSION_MAX_AGE_SECONDS,
  );
}

/** isRecoverySession at the current time (for pages and actions). */
export function isRecoverySessionNow(
  claims: { amr?: unknown } | null | undefined,
): boolean {
  return isRecoverySession(claims, Math.floor(Date.now() / 1000));
}

export const PASSWORD_ERRORS = {
  missing: "Enter a new password.",
  weak: "Use at least 6 characters.",
  same: "Choose a password you haven't used here.",
} as const;

/** The new-password field message for an auth-service refusal, or null. */
export function newPasswordErrorFor(code: string | undefined): string | null {
  if (code === "weak_password") return PASSWORD_ERRORS.weak;
  if (code === "same_password") return PASSWORD_ERRORS.same;
  return null;
}
