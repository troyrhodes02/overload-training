/**
 * Development test accounts: the pure rules (Pitch 21f spec §11, RD-26).
 * Which scenario a profile is, how the command's arguments are read, where a
 * password may be written, and which accounts it may ever act on. No database
 * access, so the unit tests and the CLI's argument checks can load it.
 */
import os from "node:os";
import path from "node:path";
import { checkUsername } from "@overload/shared/accounts/validation";
import { addDays } from "@overload/shared/plan/calendar";
import type { DemoVariant } from "../demo/fixture";
import { isQaTestEmail } from "../qa-fixture/rules";

/**
 * One disposable account per thing to test. A profile is a demo seed variant
 * plus the day the story is anchored to, relative to the account's own today.
 */
export const PROFILES = {
  /** Upper A ready today; two gyms; 32 finished workouts behind it. */
  standard: { variant: "standard", anchorOffsetDays: 0 },
  /** Upper B ready today: machines trained at two gyms, and a third gym. */
  gym: { variant: "gym", anchorOffsetDays: 0 },
  /** Today's workout has bodyweight, abs, and fixed-target lifts. */
  bodyweight: { variant: "bodyweight", anchorOffsetDays: 0 },
  /** Cardio waits beside today's lifting, with cardio history behind it. */
  cardio: { variant: "cardio", anchorOffsetDays: 0 },
  /**
   * Anchored to YESTERDAY: yesterday's Upper A was never logged, so Today
   * opens on a real missed day with Lower A waiting.
   */
  missed: { variant: "standard", anchorOffsetDays: -1 },
} as const satisfies Record<
  string,
  { variant: DemoVariant; anchorOffsetDays: number }
>;

export type ProfileName = keyof typeof PROFILES;
export const PROFILE_NAMES = Object.keys(PROFILES) as ProfileName[];

export function isProfileName(value: unknown): value is ProfileName {
  return typeof value === "string" && value in PROFILES;
}

/** The fixture's "today" for a profile, from the account's own calendar date. */
export function anchorFor(
  profile: ProfileName,
  accountTodayIso: string,
): string {
  return addDays(accountTodayIso, PROFILES[profile].anchorOffsetDays);
}

const VALUE_FLAGS = new Set([
  "--email",
  "--profile",
  "--username",
  "--confirm-ref",
]);

export type TestAccountArgs = {
  email: string | undefined;
  profile: string | undefined;
  username: string | undefined;
  confirmRef: string | undefined;
  execute: boolean;
  unexpected: string[];
};

export function parseArgs(argv: string[]): TestAccountArgs {
  const values: Record<string, string> = {};
  let execute = false;
  const unexpected: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute") execute = true;
    else if (VALUE_FLAGS.has(arg) && i + 1 < argv.length)
      values[arg] = argv[++i];
    else unexpected.push(arg);
  }
  return {
    email: values["--email"]?.trim().toLowerCase(),
    profile: values["--profile"]?.trim().toLowerCase(),
    username: values["--username"]?.trim().toLowerCase(),
    confirmRef: values["--confirm-ref"],
    execute,
    unexpected,
  };
}

/**
 * A username from the email's local part: "21f-gym@example.com" → "21f_gym".
 * Lowercase letters, digits, and underscores, at most 20 characters.
 */
export function usernameFor(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates the arguments; returns an error message or null. */
export function argsProblem(args: TestAccountArgs): string | null {
  if (args.unexpected.length > 0)
    return `Unexpected argument(s): ${args.unexpected.join(" ")}`;
  if (!args.email || !EMAIL.test(args.email))
    return "--email <address> is required: the account is always named explicitly.";
  if (!isQaTestEmail(args.email))
    return "Refusing: the email is not on a reserved test domain (example.com/.net/.org, or *.test, *.example, *.invalid, *.localhost). This tool only ever creates disposable test accounts.";
  if (!isProfileName(args.profile))
    return `--profile is required: one of ${PROFILE_NAMES.join(", ")}.`;
  const username = checkUsername(args.username ?? usernameFor(args.email));
  if (!username.ok)
    return `The username "${args.username ?? usernameFor(args.email)}" can't be used (${username.message}) Pass --username <name>: 3 to 20 lowercase letters, numbers, or underscores.`;
  return null;
}

/** Where every disposable account's password lives: outside the repository. */
export const ACCOUNTS_DIR = path.join(
  os.homedir(),
  ".overload-dev",
  "accounts",
);

/**
 * One owner-only file per account, named for its email. The email is already
 * checked to be a plain address; the name is still reduced to safe characters
 * so it can never leave the directory.
 */
export function credentialsFileFor(email: string, dir = ACCOUNTS_DIR): string {
  const safe = email.toLowerCase().replace(/[^a-z0-9@._-]+/g, "_");
  return path.join(dir, `${safe}.txt`);
}
