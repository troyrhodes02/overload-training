import "server-only";
import { isValidTimeZone } from "@/lib/plan/calendar";
import {
  DEFAULT_PROFILE_TIME_ZONE,
  establishProfile,
} from "@/lib/data/account";
import { createServerSupabase } from "@/lib/supabase/server";
import { createConfirmedUser, deleteAuthUser } from "@/lib/supabase/admin";
import { checkInviteCode, isSignupOpen } from "./invite";
import { checkEmail, checkName, PASSWORD_MIN_LENGTH } from "./validation";

/**
 * Invite-gated signup (Accounts spec §6, §11; R2, R3, R9). Order matters:
 *
 *   closed? → invite code (a wrong code is the ONLY thing reported — nothing
 *   about the email is looked up) → field rules → create a confirmed auth user
 *   (admin API) → sign in (sets the auth session cookie) → the profile, from
 *   the user the sign-in returned.
 *
 * Anything that fails after the auth user exists is compensated: the user is
 * deleted and the auth session cleared, so a failed signup leaves nothing.
 */

export type SignUpField =
  "inviteCode" | "firstName" | "lastName" | "email" | "password";

export type SignUpOutcome =
  | { kind: "created" }
  | { kind: "closed" }
  | { kind: "invalid"; fieldErrors: Partial<Record<SignUpField, string>> }
  | { kind: "email_taken" }
  | { kind: "unexpected" };

export type RawSignUp = {
  inviteCode: unknown;
  firstName: unknown;
  lastName: unknown;
  email: unknown;
  password: unknown;
  timeZone: unknown;
};

export type SignUpDeps = {
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

export const INVALID_INVITE = "That invite code isn't valid.";
export const SHORT_PASSWORD = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;

export async function signUp(
  raw: RawSignUp,
  deps: SignUpDeps = defaultDeps,
  env: Record<string, string | undefined> = process.env,
): Promise<SignUpOutcome> {
  if (!isSignupOpen(env)) return { kind: "closed" };

  const invite = checkInviteCode(raw.inviteCode, env);
  if (invite === "closed") return { kind: "closed" };
  if (invite === "invalid") {
    return { kind: "invalid", fieldErrors: { inviteCode: INVALID_INVITE } };
  }

  const fieldErrors: Partial<Record<SignUpField, string>> = {};
  if (invite === "missing") fieldErrors.inviteCode = "Enter the invite code.";
  const first = checkName("firstName", raw.firstName);
  const last = checkName("lastName", raw.lastName);
  const email = checkEmail(raw.email);
  const password = typeof raw.password === "string" ? raw.password : "";
  if (!first.ok) fieldErrors.firstName = first.message;
  if (!last.ok) fieldErrors.lastName = last.message;
  if (!email.ok) fieldErrors.email = email.message;
  if (!password) fieldErrors.password = "Enter a password.";
  if (
    Object.keys(fieldErrors).length > 0 ||
    !first.ok ||
    !last.ok ||
    !email.ok
  ) {
    return { kind: "invalid", fieldErrors };
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
      return { kind: "invalid", fieldErrors: { password: SHORT_PASSWORD } };
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
      timeZone,
    });
  } catch (error) {
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
    return { kind: "unexpected" };
  }

  return { kind: "created" };
}
