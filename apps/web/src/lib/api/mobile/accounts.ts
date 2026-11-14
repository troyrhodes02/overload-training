import "server-only";
import type {
  MobileSessionDto,
  PasswordResetResponseDto,
  SignUpResponseDto,
} from "@overload/shared/contracts/account";
import {
  CHALLENGE_FAILED,
  TOO_MANY_ATTEMPTS,
} from "@overload/shared/accounts/auth-errors";
import { requestFingerprint } from "@/lib/accounts/request-fingerprint";
import {
  requestPasswordReset,
  type RequestResetDeps,
} from "@/lib/accounts/recovery";
import { SIGNUPS_PAUSED } from "@/lib/accounts/signup-messages";
import {
  defaultSignUpDeps,
  signUp,
  type SignUpDeps,
  type SignUpOutcome,
} from "@/lib/accounts/signup";
import {
  createStatelessAuthClient,
  type StatelessAuthClient,
} from "@/lib/supabase/stateless";
import { ApiFailure, INTERNAL_ERROR_MESSAGE } from "./errors";

/**
 * Native signup and the native reset request (Pitch 21d spec §10.2, §10.5;
 * RD-7, RD-9). Both are thin adapters over the web's own modules. signUp and
 * requestPasswordReset run unchanged, with every defense the web has:
 *
 * - signup runs the throttle, Turnstile, the hourly cap, field validation,
 *   reserved usernames, the disposable-email blocklist, username uniqueness,
 *   the trial rules, and compensation;
 * - the reset request uses the same non-enumeration rule.
 *
 * Only the two cookie-bound steps change. Signup's sign-in-after-creation uses
 * a stateless anon client, and its session goes to the app instead of a
 * cookie. The recovery email is requested through the same kind of client.
 */

export const SIGNUP_BODY_LIMIT = 16 * 1024;
export const RESET_BODY_LIMIT = 4 * 1024;

export const SIGNUP_CLOSED = "Signup isn't open right now.";
export const SIGNUP_RATE_LIMITED = TOO_MANY_ATTEMPTS;
export const SIGNUP_CHALLENGE_FAILED = CHALLENGE_FAILED;
export const SIGNUP_INVALID = "Check the highlighted fields.";
export const SIGNUP_EMAIL_TAKEN = "An account with this email already exists.";
export const SIGNUP_UNEXPECTED =
  "Couldn't create your account. Nothing was saved. Try again.";

/**
 * Every refused signup outcome, as the mobile API's error envelope (spec §10.2
 * table). Existing error codes only (CLAUDE.md, mobile API rules).
 */
export function signUpFailure(
  outcome: Exclude<SignUpOutcome, { kind: "created" }>,
): ApiFailure {
  switch (outcome.kind) {
    case "closed":
    case "invite_invalid":
      // The app has no invite field: legacy invite mode reads as closed (21c RD-19).
      return new ApiFailure("invalid_state_transition", SIGNUP_CLOSED);
    case "rate_limited":
      return new ApiFailure("rate_limited", SIGNUP_RATE_LIMITED);
    case "paused":
      return new ApiFailure("rate_limited", SIGNUPS_PAUSED);
    case "challenge_failed":
      return new ApiFailure("validation_error", SIGNUP_CHALLENGE_FAILED, {
        challengeToken: SIGNUP_CHALLENGE_FAILED,
      });
    case "invalid": {
      const details: Record<string, string> = {};
      for (const [field, message] of Object.entries(outcome.fieldErrors)) {
        if (typeof message === "string") details[field] = message;
      }
      return new ApiFailure("validation_error", SIGNUP_INVALID, details);
    }
    case "email_taken":
      return new ApiFailure("conflict", SIGNUP_EMAIL_TAKEN, {
        email: SIGNUP_EMAIL_TAKEN,
      });
    default:
      return new ApiFailure("internal_error", SIGNUP_UNEXPECTED);
  }
}

export type MobileAccountsDeps = {
  signUp: typeof signUp;
  signUpDeps: SignUpDeps;
  requestPasswordReset: typeof requestPasswordReset;
  auth: () => StatelessAuthClient | null;
  /** The server environment signUp reads (signup mode, cap, bypass). */
  env?: Record<string, string | undefined>;
};

const defaultMobileAccountsDeps: MobileAccountsDeps = {
  signUp,
  signUpDeps: defaultSignUpDeps,
  requestPasswordReset,
  auth: createStatelessAuthClient,
};

/** `POST /accounts`: create the account and return its first session. */
export async function mobileSignUp(
  body: Record<string, unknown>,
  headers: { get(name: string): string | null },
  deps: MobileAccountsDeps = defaultMobileAccountsDeps,
): Promise<SignUpResponseDto> {
  const auth = deps.auth();
  if (!auth) {
    console.error("mobile signup: Supabase auth is not configured");
    throw new ApiFailure("internal_error", INTERNAL_ERROR_MESSAGE);
  }

  // The session the single sign-in after creation produced. signUp verifies
  // the signed-in user is the created one before the profile is written; a
  // compensated (failed) signup clears it.
  let session: MobileSessionDto | null = null;

  const outcome = await deps.signUp(
    {
      firstName: body.firstName,
      lastName: body.lastName,
      username: body.username,
      email: body.email,
      password: body.password,
      confirmPassword: body.confirmPassword,
      timeZone: body.timeZone,
      // Public mode needs no code; the app has no invite field.
      inviteCode: null,
      challengeToken: body.challengeToken,
      throttleKey: requestFingerprint(headers),
    },
    {
      ...deps.signUpDeps,
      async signIn(email, password) {
        const { data, error } = await auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.user || !data.session) return null;
        session = {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt:
            data.session.expires_at ??
            Math.floor(Date.now() / 1000) + data.session.expires_in,
          tokenType: "bearer",
        };
        return { user: { id: data.user.id } };
      },
      async signOut() {
        session = null;
        await auth.signOut({ scope: "local" }).catch(() => undefined);
      },
    },
    deps.env,
  );

  if (outcome.kind !== "created") throw signUpFailure(outcome);
  if (!session) throw new ApiFailure("internal_error", SIGNUP_UNEXPECTED);
  return { session };
}

/**
 * `POST /password-reset`: identical answer for every well-formed address that
 * passes the challenge (D7). Only a malformed email or a failed challenge is
 * reported, before any lookup.
 */
export async function mobileRequestPasswordReset(
  body: Record<string, unknown>,
  headers: { get(name: string): string | null },
  deps: MobileAccountsDeps = defaultMobileAccountsDeps,
): Promise<PasswordResetResponseDto> {
  const result = await deps.requestPasswordReset(
    { email: body.email, challengeToken: body.challengeToken },
    {
      throttleKey: requestFingerprint(headers),
      auth: async () => {
        const auth = deps.auth();
        // Caught inside requestPasswordReset, which still answers "sent".
        if (!auth) throw new Error("auth unconfigured");
        return auth as unknown as Awaited<ReturnType<RequestResetDeps["auth"]>>;
      },
    },
  );
  if (!result.ok) {
    throw new ApiFailure(result.error.code, result.error.message);
  }
  return { sent: true };
}
