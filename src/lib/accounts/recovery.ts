import { weakPasswordMessage } from "./validation";

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

/**
 * A session that exists ONLY because a reset link was followed: its `amr`
 * has an otp/recovery entry and no password sign-in. Such a session may set a
 * password and nothing else (spec R26): requireUser() sends it to
 * /reset-password from every app route and action, so a reset link opened by
 * someone else never puts them inside its owner's account.
 */
export function isRecoveryOnlySession(
  claims: { amr?: unknown } | null | undefined,
): boolean {
  if (!claims || !Array.isArray(claims.amr)) return false;
  const methods = (claims.amr as AmrEntry[]).map((e) => e.method);
  return (
    methods.some((m) => m === "otp" || m === "recovery") &&
    !methods.includes("password")
  );
}

/**
 * The payload of a JWT the auth service has ALREADY validated (the caller
 * must have called getUser() for the same session). Not a verifier.
 */
export function jwtPayload(token: string | undefined): {
  amr?: unknown;
} | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export const PASSWORD_ERRORS = {
  missing: "Enter a new password.",
  same: "Choose a password you haven't used here.",
} as const;

/** The new-password field message for an auth-service refusal, or null. */
export function newPasswordErrorFor(error: {
  code?: string;
  reasons?: readonly string[];
}): string | null {
  if (error.code === "weak_password") return weakPasswordMessage(error.reasons);
  if (error.code === "same_password") return PASSWORD_ERRORS.same;
  return null;
}
