import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/actions/result";
import { checkEmail, weakPasswordMessage, PASSWORD_ERRORS } from "./validation";
import { checkAndIncrement } from "./throttle";
import { verifyChallenge } from "./turnstile";

// Re-exported for server callers; the canonical definition lives in the
// client-safe validation module so the reset form can import it directly.
export { PASSWORD_ERRORS };

/**
 * Password recovery (Public Accounts, spec §9, §12, D7; revives OVE-43 over the
 * now-wired email provider). Two server-side operations, both built from
 * injectable deps so tests need no Supabase:
 *
 *   - requestPasswordReset — start recovery from an email address. It is the
 *     privacy core: after a well-formed email that passes the bot challenge,
 *     every outcome (the account exists, it does not, the email service is
 *     slow, OR the rate limiter is tripped) resolves to the IDENTICAL "sent"
 *     result (D7). Only a malformed email or a failed challenge is reported,
 *     and both BEFORE any account lookup, so neither reveals membership.
 *
 *   - setNewPassword — run under the short-lived recovery auth session that
 *     /auth/confirm established. It updates the password, ends every session,
 *     and hands the lifter back to /login to sign in fresh. It never touches
 *     Profile.status: suspension is enforced on the next authenticated request
 *     by requireAccount(), so a suspended account can never reset its way back
 *     into access.
 *
 * The order inside requestPasswordReset is deliberate and tested:
 *   verify challenge → throttle (password_reset_request) → resolve identically.
 * The challenge is verified first (it reveals nothing about any address), then
 * the throttle counts the attempt. A tripped throttle does NOT surface a
 * distinct message — it folds into the identical "sent" state (D7, spec §9).
 */

/** Pure recovery-session rules shared by the page, the action, and tests. */

/**
 * How long after following a reset link the lifter may set a new password
 * without knowing the old one. The link itself expires after an hour
 * (Supabase `otp_expiry`); this bounds the session it creates.
 */
export const RECOVERY_SESSION_MAX_AGE_SECONDS = 1800;

type AmrEntry = { method?: unknown; timestamp?: unknown };

/**
 * A recovery auth session: its JWT `amr` records an `otp` (Supabase's method
 * for a verified recovery token_hash) or `recovery` sign-in within the window.
 * A password sign-in records `password`, so an ordinary session never
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

/** The new-password field message for an auth-service refusal, or null. */
export function newPasswordErrorFor(error: {
  code?: string;
  reasons?: readonly string[];
}): string | null {
  if (error.code === "weak_password") return weakPasswordMessage(error.reasons);
  if (error.code === "same_password") return PASSWORD_ERRORS.same;
  return null;
}

/** The slice of the Supabase auth client each operation needs. */
type RecoverySupabaseAuth = {
  resetPasswordForEmail: (
    email: string,
  ) => Promise<{ error: { code?: string; status?: number } | null }>;
  getClaims: () => Promise<{
    data: { claims?: { amr?: unknown } | null } | null;
  }>;
  updateUser: (attrs: { password: string }) => Promise<{
    error: { code?: string; reasons?: readonly string[] } | null;
  }>;
  signOut: (opts?: {
    scope?: "global" | "local" | "others";
  }) => Promise<{ error: { code?: string } | null }>;
};

export type RequestResetInput = { email: unknown; challengeToken: unknown };

export type RequestResetDeps = {
  verifyChallenge: typeof verifyChallenge;
  checkAndIncrement: typeof checkAndIncrement;
  /** Opaque rate-limit key — a request fingerprint, NEVER the email (spec §9). */
  throttleKey: string;
  /** Builds the Supabase auth client bound to this request's cookies. */
  auth: () => Promise<RecoverySupabaseAuth>;
};

async function defaultAuth(): Promise<RecoverySupabaseAuth> {
  const supabase = await createServerSupabase();
  return supabase.auth as unknown as RecoverySupabaseAuth;
}

const defaultRequestDeps: RequestResetDeps = {
  verifyChallenge,
  checkAndIncrement,
  throttleKey: "unknown",
  auth: defaultAuth,
};

/**
 * Start recovery for `email`. Returns `validation_error` for a malformed email
 * or a failed challenge (both before any lookup, revealing nothing); otherwise
 * `{ sent: true }`, the IDENTICAL result whether the account exists, does not,
 * the service is slow, or the throttle is tripped (D7). The recovery email is
 * triggered through Supabase Auth's own template, which only sends to an
 * address that has an account — but the response never depends on that.
 */
export async function requestPasswordReset(
  input: RequestResetInput,
  deps: Partial<RequestResetDeps> = {},
): Promise<ActionResult<{ sent: true }>> {
  const { verifyChallenge, checkAndIncrement, throttleKey, auth } = {
    ...defaultRequestDeps,
    ...deps,
  };

  // Shape first: a malformed email is reported before anything else and never
  // reaches the auth service, so it reveals nothing. The challenge is verified
  // next, before any throttle bump or account work.
  const email = checkEmail(input.email);
  if (!email.ok) {
    return {
      ok: false,
      error: { code: "validation_error", message: email.message },
    };
  }

  const CHALLENGE_FAILED = "Couldn't verify you're human. Try again.";
  if (!(await verifyChallenge(input.challengeToken))) {
    return {
      ok: false,
      error: { code: "validation_error", message: CHALLENGE_FAILED },
    };
  }

  // The throttle counts the attempt. Whether it is allowed or not, the lifter
  // sees the identical "sent" state (D7) — a visibly different outcome would
  // leak that this address was worth limiting. A tripped limit simply skips
  // the send; the endpoint is still protected server-side.
  const { allowed } = await checkAndIncrement(
    "password_reset_request",
    throttleKey,
  );

  if (allowed) {
    // Trigger the Supabase recovery email. Its template links to /auth/confirm,
    // which exchanges the one-time token for the recovery session and continues
    // to /reset-password. Failures are logged by code only — NEVER the address
    // — and never change the result the lifter sees.
    try {
      const authClient = await auth();
      const { error } = await authClient.resetPasswordForEmail(email.value);
      if (error) {
        console.error(
          `password reset request not sent (${error.code ?? error.status ?? "unknown"})`,
        );
      }
    } catch {
      console.error("password reset request not sent (unreachable)");
    }
  }

  return { ok: true, data: { sent: true } };
}

export type SetNewPasswordInput = { newPassword: unknown };

export type SetNewPasswordDeps = {
  auth: () => Promise<RecoverySupabaseAuth>;
  now: () => number;
};

const defaultSetDeps: SetNewPasswordDeps = {
  auth: defaultAuth,
  now: Date.now,
};

export const SET_PASSWORD_UNEXPECTED =
  "Couldn't set your password. Try again, or send a new link.";

export type SetNewPasswordResult =
  | { ok: true; data: { updated: true } }
  | {
      ok: false;
      error: {
        /** The recovery session is gone (opened directly, expired, reused). */
        code: "expired" | "validation_error" | "internal_error";
        message: string | null;
      };
    };

/**
 * Set a new password under the recovery auth session. The session is
 * re-checked here, not only on the page: an ordinary password session can
 * never change the password without the old one. On success EVERY session of
 * the account ends (this one included, spec design Screen 5) so the lifter
 * signs in again with the new password — a reset link opened by someone else
 * can therefore never leave them inside its owner's account. Profile.status is
 * never read or written: suspension is decided on the next request.
 */
export async function setNewPassword(
  input: SetNewPasswordInput,
  deps: Partial<SetNewPasswordDeps> = {},
): Promise<SetNewPasswordResult> {
  const { auth, now } = { ...defaultSetDeps, ...deps };
  const supabaseAuth = await auth();

  const { data } = await supabaseAuth.getClaims();
  if (!isRecoverySession(data?.claims, Math.floor(now() / 1000))) {
    return { ok: false, error: { code: "expired", message: null } };
  }

  const password =
    typeof input.newPassword === "string" ? input.newPassword : "";
  if (password.length === 0) {
    return {
      ok: false,
      error: { code: "validation_error", message: PASSWORD_ERRORS.missing },
    };
  }

  const { error } = await supabaseAuth.updateUser({ password });
  if (error) {
    const fieldError = newPasswordErrorFor(error);
    if (!fieldError) {
      console.error(`password reset failed (${error.code ?? "unknown"})`);
      return {
        ok: false,
        error: { code: "internal_error", message: SET_PASSWORD_UNEXPECTED },
      };
    }
    return {
      ok: false,
      error: { code: "validation_error", message: fieldError },
    };
  }

  // Every session ends, this one included: the reset session never reaches the
  // app proper. A failure here is logged by code only and does not block the
  // redirect — the password is already changed.
  const { error: signOutError } = await supabaseAuth.signOut({
    scope: "global",
  });
  if (signOutError) {
    console.error(
      `signing out after a reset failed (${signOutError.code ?? "unknown"})`,
    );
  }

  return { ok: true, data: { updated: true } };
}
