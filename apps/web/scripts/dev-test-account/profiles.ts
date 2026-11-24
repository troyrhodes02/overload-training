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
import type { DemoVariant, FixtureExercise } from "../demo/fixture";
import { isQaTestEmail } from "../qa-fixture/rules";
import {
  RESOURCE_PLANS,
  type ResourcePlan,
  type ResourcePlanName,
} from "./resource-plans";

/**
 * What the UNCHANGED engine must say about one of today's lifts (Pitch 21g
 * spec §11). `call` is the card's state; `action` is the server's exact
 * sentence on the card (and on Today's planned list, which advises the same
 * "today"). Checked by the command's engine check and, through the card
 * reader, by tests/integration/dev-test-account-profiles.int.test.ts.
 */
export type CallExpectation = {
  ex: FixtureExercise;
  call:
    | "progress"
    | "hold"
    | "stalled"
    | "reassess"
    | "deload"
    | "deload_week"
    | "insufficient"
    | "locked";
  action?: string;
  rirEffect?: "held_at_limit" | "released_stall";
};

type Profile = {
  variant: DemoVariant;
  anchorOffsetDays: number;
  /** The account's plan when created. Default Pro (comp). */
  access?: "pro" | "free";
  /** Today's workout is in a scheduled-deload week (Pitch 21g). */
  deloadWeek?: boolean;
  expect?: readonly CallExpectation[];
  /** How many earlier unfinished workouts Today lists (OVE-228). */
  unfinished?: number;
  /** False: the account gets no training data at all (Pitch 21h no-plan). */
  seed?: boolean;
  /** Extra custom exercises, favorites, and gyms (Pitch 21h). */
  resources?: ResourcePlanName;
};

/** The standard story's calls on today's Upper A. */
const STANDARD_CALLS: readonly CallExpectation[] = [
  { ex: "BENCH", call: "progress", action: "Try 185 lb today (+5 lb)" },
  { ex: "OHP", call: "deload", action: "Lower the weight today" },
  { ex: "INCLINE_DB", call: "hold", action: "Stay at 60 lb today" },
];

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

  // ── Pitch 21g: insight scenarios. Today's workout is Upper A (Barbell Bench
  //    Press, Standing Military Press, Incline Dumbbell Press, Wide-Grip Lat
  //    Pulldown) unless noted. Every call comes from real logged history.
  /** Bench: Progress, "Try 185 lb today"; Military Press Deload; Incline Hold. */
  progress: {
    variant: "standard",
    anchorOffsetDays: 0,
    expect: STANDARD_CALLS,
  },
  /** Bench last time 180 × 8, 7, 7 → Hold. */
  hold: {
    variant: "hold",
    anchorOffsetDays: 0,
    expect: [{ ex: "BENCH", call: "hold", action: "Stay at 180 lb today" }],
  },
  /** Bench below 6 reps two Upper A's running → reactive Deload. */
  "reactive-deload": {
    variant: "reactive-deload",
    anchorOffsetDays: 0,
    expect: [{ ex: "BENCH", call: "deload", action: "Lower the weight today" }],
  },
  /** RIR changes three calls: held at the limit, stall released, stall kept. */
  rir: {
    variant: "rir",
    anchorOffsetDays: 0,
    expect: [
      {
        ex: "BENCH",
        call: "hold",
        action: "Stay at 180 lb today",
        rirEffect: "held_at_limit",
      },
      {
        ex: "OHP",
        call: "progress",
        action: "Try 115 lb today (+5 lb)",
        rirEffect: "released_stall",
      },
      { ex: "INCLINE_DB", call: "stalled", action: "Stay at 60 lb today" },
    ],
  },
  /** Today is week 4 of a block that deloads every 4th week. */
  "scheduled-deload": {
    variant: "scheduled-deload",
    anchorOffsetDays: 0,
    deloadWeek: true,
    expect: [
      { ex: "BENCH", call: "deload_week", action: "Deload week: 160 lb (90%)" },
      // Its history is a reactive deload: suppressed in the deload week.
      { ex: "OHP", call: "deload_week", action: "Deload week: 100 lb (90%)" },
    ],
  },
  /** Last week was the deload week; today calls resume. */
  "post-deload": {
    variant: "post-deload",
    anchorOffsetDays: 0,
    deloadWeek: false,
    expect: [
      { ex: "BENCH", call: "progress", action: "Try 180 lb today (+5 lb)" },
    ],
  },
  /** A new block a week old: 1 of the 2 complete sessions a call needs. */
  insufficient: {
    variant: "insufficient",
    anchorOffsetDays: 0,
    expect: [
      { ex: "BENCH", call: "insufficient" },
      { ex: "OHP", call: "insufficient" },
      { ex: "INCLINE_DB", call: "insufficient" },
    ],
  },
  /** Bench last time 180 × 8, 8, 7 at RIR 1, 1, 0: correct it and watch the call move. */
  edit: {
    variant: "edit",
    anchorOffsetDays: 0,
    expect: [{ ex: "BENCH", call: "hold", action: "Stay at 180 lb today" }],
  },
  /** The standard story on the Free plan: every call withheld (locked). */
  free: {
    variant: "standard",
    anchorOffsetDays: 0,
    access: "free",
    expect: [
      { ex: "BENCH", call: "locked" },
      { ex: "OHP", call: "locked" },
      { ex: "INCLINE_DB", call: "locked" },
    ],
  },
  /** The standard story, Pro; switch it with --access free / --access pro. */
  entitlement: {
    variant: "standard",
    anchorOffsetDays: 0,
    expect: STANDARD_CALLS,
  },
  /** The standard story: finish it with a swap and a skip to read the summary. */
  summary: { variant: "standard", anchorOffsetDays: 0, expect: STANDARD_CALLS },
  /** Today's Upper A already started: Bench sets 1–2 logged. */
  recovery: {
    variant: "recovery",
    anchorOffsetDays: 0,
    expect: [
      { ex: "BENCH", call: "progress", action: "Try 185 lb today (+5 lb)" },
    ],
  },
  /** One of two accounts with different data (the standard story). */
  "isolation-a": {
    variant: "standard",
    anchorOffsetDays: 0,
    expect: STANDARD_CALLS,
  },
  /** The other: bodyweight lifts (Pullups, Crunches). */
  "isolation-b": { variant: "bodyweight", anchorOffsetDays: 0 },

  // ── Pitch 21g final corrections (OVE-228, OVE-229, OVE-230).
  /**
   * Anchored to YESTERDAY: yesterday's Upper A was started and left with
   * Bench sets 1–2 saved; today's Lower A is ready. Today lists it.
   */
  unfinished: { variant: "recovery", anchorOffsetDays: -1, unfinished: 1 },
  /**
   * Anchored TWO days back: that day's Upper A (Bench 180 × 8, 8) and the
   * next day's Lower A (Squat 215 × 7) were both left unfinished. Today is a
   * rest day and lists both.
   */
  "multiple-unfinished": {
    variant: "multiple-unfinished",
    anchorOffsetDays: -2,
    unfinished: 2,
  },
  /**
   * The weight box vs the call: Bench Progress with a number ("Try 185 lb",
   * box 180) and Military Press reactive Deload (no number, box 115).
   */
  "weight-clarity": {
    variant: "standard",
    anchorOffsetDays: 0,
    expect: STANDARD_CALLS,
  },
  /** A real deload week: Bench "Deload week: 160 lb (90%)", box empty. */
  "deload-clarity": {
    variant: "scheduled-deload",
    anchorOffsetDays: 0,
    deloadWeek: true,
    expect: [
      { ex: "BENCH", call: "deload_week", action: "Deload week: 160 lb (90%)" },
    ],
  },
  /** Free, with yesterday's Upper A left unfinished; today's calls locked. */
  "parity-free": {
    variant: "recovery",
    anchorOffsetDays: -1,
    access: "free",
    unfinished: 1,
    expect: [
      { ex: "SQUAT", call: "locked" },
      { ex: "RDL", call: "locked" },
    ],
  },
  /** Pro, the standard story: finish it with a swap and a skip. */
  "parity-summary": {
    variant: "standard",
    anchorOffsetDays: 0,
    expect: STANDARD_CALLS,
  },

  // ── Pitch 21h: plans, library, and gyms. The plan itself is `standard`
  //    (and `scheduled-deload` for a deload week); a workout in progress is
  //    `recovery`. These add what those don't have.
  /** An account with no training data at all: no plan, no gyms. */
  "no-plan": { variant: "standard", anchorOffsetDays: 0, seed: false },
  /**
   * Upper A today with Bench 3 × 6–8, Pullups 3 × 8–10 (bodyweight), Incline
   * Dumbbell Press 3 × 10 (fixed), Crunches 3 × 15 (bodyweight, fixed), and
   * planned cardio on Upper A's day.
   */
  "session-detail": { variant: "session-detail", anchorOffsetDays: 0 },
  /** The standard story, plus favorites and one of the lifter's own exercises. */
  library: { variant: "standard", anchorOffsetDays: 0, resources: "library" },
  /**
   * Anchored to YESTERDAY: yesterday's Upper A was finished with Standing
   * Military Press swapped for the custom Landmine Press (3 sets), so History
   * names it; plus Banded Face Pull (active) and Cable Y Raise (archived).
   */
  "custom-exercises": {
    variant: "recovery",
    anchorOffsetDays: -1,
    resources: "custom-exercises",
  },
  /**
   * The gym story (machines at Northside and Riverside, Harbor Barbell
   * empty), plus Downtown Annex with a location, and Riverside archived
   * with its history and machine weights kept.
   */
  gyms: { variant: "gym", anchorOffsetDays: 0, resources: "gyms" },
  /** Two accounts with different own exercises, favorites, and gyms. */
  "isolation-resources-a": {
    variant: "standard",
    anchorOffsetDays: 0,
    resources: "isolation-resources-a",
  },
  "isolation-resources-b": {
    variant: "bodyweight",
    anchorOffsetDays: 0,
    resources: "isolation-resources-b",
  },

  // ── Pitch 21i and OVE-241: goals, exercise history, and this week's
  //    schedule. One primary account and one Free account (run prompt §28).
  /**
   * The gym story anchored today: Upper B today, Lower B tomorrow, a rest
   * day, Upper A, Lower A, and two rest days (Swap, Train today after a
   * swap, and Skip all available); machines at two gyms; 30+ finished
   * workouts across two blocks; RIR on recent Bench; four goals (see the
   * resource plan). Create it on the day of testing.
   */
  "21i-combined": {
    variant: "gym",
    anchorOffsetDays: 0,
    resources: "21i-combined",
  },
  /** The standard story on Free, with one active goal: Free history and goals, Pro withheld. */
  "21i-free": {
    variant: "standard",
    anchorOffsetDays: 0,
    access: "free",
    resources: "21i-free",
  },
} as const satisfies Record<string, Profile>;

export type ProfileName = keyof typeof PROFILES;
export const PROFILE_NAMES = Object.keys(PROFILES) as ProfileName[];

export function isProfileName(value: unknown): value is ProfileName {
  return typeof value === "string" && value in PROFILES;
}

/** A profile's full description (optional fields made explicit). */
export function profileOf(name: ProfileName): Required<
  Omit<Profile, "deloadWeek" | "unfinished" | "resources">
> & {
  deloadWeek: boolean | null;
  unfinished: number | null;
  resources: ResourcePlan | null;
} {
  const p: Profile = PROFILES[name];
  return {
    variant: p.variant,
    anchorOffsetDays: p.anchorOffsetDays,
    access: p.access ?? "pro",
    deloadWeek: p.deloadWeek ?? null,
    expect: p.expect ?? [],
    unfinished: p.unfinished ?? null,
    seed: p.seed ?? true,
    resources: p.resources ? RESOURCE_PLANS[p.resources] : null,
  };
}

export const ACCESS_VALUES = ["pro", "free"] as const;
export type AccessValue = (typeof ACCESS_VALUES)[number];

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
  "--access",
]);

export type TestAccountArgs = {
  email: string | undefined;
  profile: string | undefined;
  username: string | undefined;
  confirmRef: string | undefined;
  /** Pitch 21g: switch an existing test account to Pro or Free instead. */
  access?: string;
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
    ...(values["--access"] !== undefined
      ? { access: values["--access"].trim().toLowerCase() }
      : {}),
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
  if (args.access !== undefined) {
    if (args.profile !== undefined || args.username !== undefined)
      return "--access switches an existing test account's plan; it takes no --profile or --username.";
    if (!(ACCESS_VALUES as readonly string[]).includes(args.access))
      return "--access must be pro or free.";
    return null;
  }
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
