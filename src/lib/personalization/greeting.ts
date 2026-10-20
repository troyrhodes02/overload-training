import type { DashboardDto } from "@/lib/logging/queries";

/**
 * The Today greeting (Personalization & Navigation Polish, spec §11; design
 * doc Screen 1). A PURE function of facts the server already has: today's
 * dashboard state (read, never changed), the first name, the account's stored
 * timezone, whether this is the account's first visit, the account id, and the
 * current instant. Nothing is stored and nothing is random: the same account,
 * situation, and local date always produce the same sentence, so it never
 * changes while the lifter is looking at it.
 *
 * It acknowledges; it never advises. No emoji, no "!" or "?", nothing about
 * weights, tags, or other days — the progression engine and the missed-day
 * prompt own those.
 */

export type GreetingSituation =
  | "planned"
  | "underway"
  | "cardio_planned"
  | "done"
  | "done_cardio"
  | "rest"
  | "no_plan";

export type TimeBand =
  "morning" | "afternoon" | "evening" | "night" | "unknown";

export type GreetingInput = {
  dashboard: DashboardDto;
  /** Trimmed first name, or null when the account has none saved. */
  firstName: string | null;
  /** The account's stored IANA zone, or null when it is unusable (R18). */
  timeZone: string | null;
  firstVisit: boolean;
  /** The acting account's id (account.userId) — only seeds the variant pick. */
  accountKey: string;
  now: Date;
};

// --- wording: the design doc's library, verbatim (R21) -----------------------
// {Sal} salutation · {N} first name · {S} session name · {C} cardio type.

/** The clause after "{Sal}, {N}." — one list per situation. */
export const CLAUSES: Record<GreetingSituation, readonly string[]> = {
  planned: ["{S} is up.", "{S} today.", "Today is {S}."],
  underway: ["{S} is underway.", "{S} is in progress.", "{S} is still open."],
  cardio_planned: ["{C} is up.", "{C} today.", "{C} is on today's plan."],
  done: ["{S} is done.", "{S} is logged.", "Today's training is logged."],
  done_cardio: [
    "{C} is logged.",
    "Today's training is logged.",
    "{C} is done.",
  ],
  rest: ["Rest day today.", "Nothing planned today.", "Today is a rest day."],
  no_plan: [
    "No active plan yet.",
    "Nothing scheduled yet.",
    "No plan is running right now.",
  ],
};

/** A planned or underway workout between 9:00 pm and 3:59 am local. */
export const LATE_NIGHT: readonly string[] = [
  "Late session, {N}. {S} is still up.",
  "Working late, {N}. {S} is still open.",
  "Late one tonight, {N}. {S} is still up.",
];

/** The late-night clause after a first-visit welcome. */
export const LATE_CLAUSES: Record<"planned" | "underway", string> = {
  planned: "{S} is still up.",
  underway: "{S} is still open.",
};

export const WELCOMES: readonly string[] = [
  "Welcome to Overload, {N}.",
  "Welcome, {N}.",
];

export const SALUTATIONS: Record<TimeBand, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Hello",
  unknown: "Hello",
};

/** The late-night window: from 21:00 until 03:59 local (standing resolution). */
const LATE_FROM_HOUR = 21;
const LATE_UNTIL_HOUR = 4;

// --- situation ---------------------------------------------------------------

type CardioEntries = Extract<DashboardDto, { kind: "rest" }>["cardio"];

function restOrCardio(cardio: CardioEntries): GreetingSituation {
  if (cardio.length === 0) return "rest";
  return cardio.some((c) => c.log === null) ? "cardio_planned" : "done_cardio";
}

/**
 * Today's situation from the dashboard's own state (R14). A missed earlier day
 * never changes it: the greeting describes today, using the state shown
 * beneath the missed-day prompt.
 */
export function greetingSituation(d: DashboardDto): GreetingSituation {
  switch (d.kind) {
    case "no_plan":
      return "no_plan";
    case "rest":
      return restOrCardio(d.cardio);
    case "missed_day":
      return d.below ? greetingSituation(d.below) : restOrCardio(d.cardio);
    case "pending":
      return "planned";
    case "in_progress":
      return "underway";
    case "complete":
      return "done";
  }
}

/** The session or cardio name the clause speaks about, if any. */
function subject(d: DashboardDto): { session: string; cardio: string } {
  const today = d.kind === "missed_day" ? d.below : d;
  const cardio =
    d.kind === "rest" || d.kind === "missed_day" ? d.cardio : ([] as const);
  const pending = cardio.find((c) => c.log === null);
  return {
    session:
      today && today.kind !== "no_plan" && today.kind !== "rest"
        ? today.sessionName
        : "",
    cardio: pending
      ? pending.planned.type
      : (cardio[0]?.log?.type ?? cardio[0]?.planned.type ?? ""),
  };
}

// --- time --------------------------------------------------------------------

/** The local hour (0–23) of an instant in a zone, or null without a zone. */
function localHour(now: Date, timeZone: string | null): number | null {
  if (!timeZone) return null;
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .find((p) => p.type === "hour")?.value;
    const n = Number(hour);
    return Number.isInteger(n) ? n % 24 : null;
  } catch {
    return null;
  }
}

/** The local calendar date ("YYYY-MM-DD") — the seed's day. */
function localDate(now: Date, timeZone: string | null): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Account-local time band (R15); `unknown` without a usable zone. */
export function timeBand(now: Date, timeZone: string | null): TimeBand {
  const h = localHour(now, timeZone);
  if (h === null) return "unknown";
  if (h < 4) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

/** 9:00 pm – 3:59 am in the account's zone; never without a zone. */
export function isLateNight(now: Date, timeZone: string | null): boolean {
  const h = localHour(now, timeZone);
  return h !== null && (h >= LATE_FROM_HOUR || h < LATE_UNTIL_HOUR);
}

// --- deterministic pick ------------------------------------------------------

/** FNV-1a, 32-bit: a stable, dependency-free string hash (R16). */
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function pickVariant<T>(variants: readonly T[], seed: string): T {
  return variants[fnv1a32(seed) % variants.length];
}

// --- composition -------------------------------------------------------------

function fill(
  template: string,
  values: { sal: string; name: string | null; session: string; cardio: string },
): string {
  // No first name saved: drop the name and its comma (R19).
  const shaped = values.name ? template : template.replaceAll(", {N}", "");
  const tokens: Record<string, string> = {
    Sal: values.sal,
    N: values.name ?? "",
    S: values.session,
    C: values.cardio,
  };
  // One pass, so the lifter's own text (a session named "{N}") is never
  // read as a placeholder.
  return shaped
    .replace(/\{(Sal|N|S|C)\}/g, (_, key: string) => tokens[key])
    .replace(/\s+/g, " ")
    .trim();
}

export function composeGreeting(input: GreetingInput): string {
  const { dashboard, firstName, timeZone, firstVisit, accountKey, now } = input;
  const situation = greetingSituation(dashboard);
  const late =
    (situation === "planned" || situation === "underway") &&
    isLateNight(now, timeZone);
  const family = late ? `late_${situation}` : situation;
  const seed = `${accountKey}|${localDate(now, timeZone)}|${firstVisit ? "first:" : ""}${family}`;
  const { session, cardio } = subject(dashboard);
  const values = {
    sal: SALUTATIONS[timeBand(now, timeZone)],
    name: firstName?.trim() || null,
    session,
    cardio,
  };

  if (firstVisit) {
    const welcome = pickVariant(WELCOMES, seed);
    if (situation === "no_plan") return fill(welcome, values);
    const clause = late
      ? LATE_CLAUSES[situation as "planned" | "underway"]
      : pickVariant(CLAUSES[situation], `${seed}:clause`);
    return fill(`${welcome} ${clause}`, values);
  }

  if (late) return fill(pickVariant(LATE_NIGHT, seed), values);
  return fill(`{Sal}, {N}. ${pickVariant(CLAUSES[situation], seed)}`, values);
}
