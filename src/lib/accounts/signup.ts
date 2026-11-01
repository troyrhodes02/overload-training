import "server-only";
import { isValidTimeZone } from "@/lib/plan/calendar";
import {
  DEFAULT_PROFILE_TIME_ZONE,
  establishProfile,
} from "@/lib/data/account";
import { isUsernameAvailable } from "@/lib/data/usernames";
import { createServerSupabase } from "@/lib/supabase/server";
import { createConfirmedUser, deleteAuthUser } from "@/lib/supabase/admin";
import { isInviteValid, signupMode } from "./signup-gate";
import { checkAndIncrement } from "./throttle";
import { verifyChallenge } from "./turnstile";
import { UsernameTakenError } from "./username-taken";
import {
  checkEmail,
  checkName,
  checkUsername,
  PASSWORDS_DIFFER,
  USERNAME_TAKEN,
  weakPasswordMessage,
} from "./validation";

/**
 * Self-signup (OVE-50; extended by Public Accounts, spec §9, R1). Order
 * matters:
 *
 *   mode gate (closed?) → (invite mode) invite code checked FIRST, its error
 *   shown ALONE → field rules (incl. the password typed twice) → username free?
 *   → create a confirmed auth user (admin API) → sign in (sets the auth
 *   session cookie) → the profile, from the user the sign-in returned.
 *
 * The invite check runs before any field feedback so a codeless visitor learns
 * nothing about any address. The server rate limiter (throttle) and the
 * Turnstile challenge (PA2) run AFTER the invite check and BEFORE any field
 * feedback or createConfirmedUser call, so a throttled or un-verified attempt
 * never creates-then-deletes a user and never leaks whether an email exists.
 *
 * Anything that fails after the auth user exists is compensated: the user is
 * deleted and the auth session cleared, so a failed signup leaves nothing.
 * That includes losing a race for the username, which the unique index
 * decides.
 */

export type SignUpField =
  | "firstName"
  | "lastName"
  | "username"
  | "email"
  | "password"
  | "confirmPassword";

export type SignUpOutcome =
  | { kind: "created" }
  | { kind: "closed" }
  | { kind: "invite_invalid" }
  | { kind: "rate_limited" }
  | { kind: "challenge_failed" }
  | { kind: "invalid"; fieldErrors: Partial<Record<SignUpField, string>> }
  | { kind: "email_taken" }
  | { kind: "unexpected" };

export type RawSignUp = {
  firstName: unknown;
  lastName: unknown;
  username: unknown;
  email: unknown;
  password: unknown;
  confirmPassword: unknown;
  timeZone: unknown;
  /** Invite mode only; checked on the server before any field feedback. */
  inviteCode: unknown;
  /**
   * Turnstile challenge token (Public Accounts §3.2). Verified server-side
   * (verifyChallenge) after the invite check and before any field feedback or
   * createConfirmedUser; a missing/faked token fails identically to a human
   * failure.
   */
  challengeToken?: unknown;
  /**
   * Opaque rate-limit key for the throttle (PA2, §9/R4). A coarse request
   * fingerprint (e.g. the client IP) resolved by the server action from request
   * headers — NEVER the email, so a rate-limit decision reveals no membership.
   * It is SHA-256-hashed inside the throttle before touching the database.
   */
  throttleKey?: unknown;
};

export type SignUpDeps = {
  checkAndIncrement: typeof checkAndIncrement;
  verifyChallenge: typeof verifyChallenge;
  isUsernameAvailable: typeof isUsernameAvailable;
  createConfirmedUser: typeof createConfirmedUser;
  deleteAuthUser: typeof deleteAuthUser;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ user: { id: string } } | null>;
  signOut: () => Promise<void>;
  establishProfile: typeof establishProfile;
};

const defaultDeps: SignUpDeps = {
  checkAndIncrement,
  verifyChallenge,
  isUsernameAvailable,
  createConfirmedUser,
  deleteAuthUser,
  async signIn(email, password) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return error || !data.user ? null : { user: { id: data.user.id } };
  },
  async signOut() {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  },
  establishProfile,
};

export async function signUp(
  raw: RawSignUp,
  deps: SignUpDeps = defaultDeps,
  env: Record<string, string | undefined> = process.env,
): Promise<SignUpOutcome> {
  const mode = signupMode(env);
  if (mode === "closed") return { kind: "closed" };

  // Invite mode: the code is checked FIRST, and its failure is reported alone.
  // A codeless visitor gets no email/name/username/password feedback, so they
  // learn nothing about any address.
  if (mode === "invite" && !isInviteValid(raw.inviteCode, env)) {
    return { kind: "invite_invalid" };
  }

  // Abuse protection (PA2, §9/R4–R6) runs BEFORE any field feedback and before
  // any createConfirmedUser call, so a throttled or un-verified attempt never
  // creates-then-deletes a user. The throttle counts first (cheap, DB-atomic),
  // then the challenge is verified server-side. Both decisions are independent
  // of the email, so neither reveals membership.
  const throttleKey =
    typeof raw.throttleKey === "string" && raw.throttleKey
      ? raw.throttleKey
      : "unknown";
  const { allowed } = await deps.checkAndIncrement("signup", throttleKey);
  if (!allowed) return { kind: "rate_limited" };

  if (!(await deps.verifyChallenge(raw.challengeToken))) {
    return { kind: "challenge_failed" };
  }

  const fieldErrors: Partial<Record<SignUpField, string>> = {};
  const first = checkName("firstName", raw.firstName);
  const last = checkName("lastName", raw.lastName);
  const username = checkUsername(raw.username);
  const email = checkEmail(raw.email);
  const password = typeof raw.password === "string" ? raw.password : "";
  const confirm =
    typeof raw.confirmPassword === "string" ? raw.confirmPassword : "";
  if (!first.ok) fieldErrors.firstName = first.message;
  if (!last.ok) fieldErrors.lastName = last.message;
  if (!username.ok) fieldErrors.username = username.message;
  if (!email.ok) fieldErrors.email = email.message;
  if (!password) fieldErrors.password = "Enter a password.";
  else if (!confirm) fieldErrors.confirmPassword = "Enter your password again.";
  else if (confirm !== password) fieldErrors.confirmPassword = PASSWORDS_DIFFER;
  // The parse results narrow the types; fieldErrors also holds the password
  // presence and match errors.
  if (
    !first.ok ||
    !last.ok ||
    !username.ok ||
    !email.ok ||
    fieldErrors.password ||
    fieldErrors.confirmPassword
  ) {
    return { kind: "invalid", fieldErrors };
  }

  if (!(await deps.isUsernameAvailable(username.value))) {
    return { kind: "invalid", fieldErrors: { username: USERNAME_TAKEN } };
  }

  const created = await deps.createConfirmedUser({
    email: email.value,
    password,
  });
  if (!created.ok) {
    if (
      created.code === "email_exists" ||
      created.code === "user_already_exists"
    ) {
      return { kind: "email_taken" };
    }
    if (created.code === "weak_password") {
      return {
        kind: "invalid",
        fieldErrors: { password: weakPasswordMessage(created.reasons) },
      };
    }
    if (
      created.code === "email_address_invalid" ||
      created.code === "validation_failed"
    ) {
      return {
        kind: "invalid",
        fieldErrors: { email: "Enter a valid email address." },
      };
    }
    console.error(`signup: account creation failed (${created.code})`);
    return { kind: "unexpected" };
  }

  try {
    const session = await deps.signIn(email.value, password);
    if (!session || session.user.id !== created.user.id) {
      throw new Error("signup: sign-in after creation failed");
    }
    const timeZone =
      typeof raw.timeZone === "string" && isValidTimeZone(raw.timeZone)
        ? raw.timeZone
        : DEFAULT_PROFILE_TIME_ZONE;
    await deps.establishProfile(session.user, {
      firstName: first.value,
      lastName: last.value,
      username: username.value,
      timeZone,
    });
  } catch (error) {
    // The unique index refused the username: another signup took it between
    // the availability check and the profile write.
    const lostUsernameRace = error instanceof UsernameTakenError;
    console.error(
      "signup: compensating a partially created account",
      error instanceof Error ? error.name : "unknown",
    );
    // Leave nothing behind: no auth user, no auth session. (No profile exists
    // unless establishProfile itself got far enough; the profile is the only
    // owned row, and it is unreachable without the deleted identity.)
    await Promise.allSettled([
      deps.deleteAuthUser(created.user.id),
      deps.signOut(),
    ]);
    return lostUsernameRace
      ? { kind: "invalid", fieldErrors: { username: USERNAME_TAKEN } }
      : { kind: "unexpected" };
  }

  return { kind: "created" };
}
