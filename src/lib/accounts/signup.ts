import "server-only";
import { DomainError } from "@/lib/actions/result";
import { isValidTimeZone } from "@/lib/plan/calendar";
import {
  DEFAULT_PROFILE_TIME_ZONE,
  establishProfile,
} from "@/lib/data/account";
import { isUsernameAvailable } from "@/lib/data/usernames";
import { createServerSupabase } from "@/lib/supabase/server";
import { createConfirmedUser, deleteAuthUser } from "@/lib/supabase/admin";
import { isSignupOpen } from "./signup-gate";
import {
  checkEmail,
  checkName,
  checkUsername,
  PASSWORDS_DIFFER,
  USERNAME_TAKEN,
  weakPasswordMessage,
} from "./validation";

/**
 * Self-signup (OVE-50, on the Accounts spec §6, §11; R3, R9). Order matters:
 *
 *   closed? → field rules (incl. the password typed twice) → username free?
 *   → create a confirmed auth user (admin API) → sign in (sets the auth
 *   session cookie) → the profile, from the user the sign-in returned.
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
};

export type SignUpDeps = {
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
  if (!isSignupOpen(env)) return { kind: "closed" };

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
    const lostUsernameRace =
      error instanceof DomainError && error.code === "conflict";
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
