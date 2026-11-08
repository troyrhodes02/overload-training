/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the deterministic shorthand
 * parser. PURE and offline: it takes the raw strings the model OBSERVED for an
 * exercise (name, sets, reps, load, rest, tempo, notes) and turns them into the
 * plan fields Overload actually stores — `{ plannedSets, targetRepMin,
 * targetRepMax }` — plus a list of issues when something is ambiguous, missing,
 * or out of scope.
 *
 * Principles (blueprint §3.5):
 *  - The model observes; this code decides. Nothing here is guessed: a value the
 *    source never stated stays null and is surfaced as REQUIRED_MISSING, never
 *    filled in.
 *  - Units are preserved EXACTLY as written. kg is never silently turned into lb
 *    (or the reverse); a mix of units in one exercise emits MIXED_UNITS. Load,
 *    rest, tempo, %, RPE/RIR, and superset labels have no plan column (spec RD-3)
 *    — they are parsed only to render read-only "from your source" context and
 *    are dropped on confirm.
 *  - The raw text is always kept beside the parsed value so review can show it.
 *
 * No Prisma, no network, no account id: this module is a pure function so it can
 * be covered by the 100+ offline fixtures the spec requires (§14.12).
 */

import {
  MAX_SETS_PER_EXERCISE,
  MAX_EXERCISES_PER_DAY,
  MAX_DAYS,
} from "../constants";

/** The named issue codes the parser and matcher raise (blueprint §3.5). */
export const ISSUE_CODES = {
  EXERCISE_AMBIGUOUS: "EXERCISE_AMBIGUOUS",
  EXERCISE_UNRECOGNIZED: "EXERCISE_UNRECOGNIZED",
  VALUE_AMBIGUOUS: "VALUE_AMBIGUOUS",
  REQUIRED_MISSING: "REQUIRED_MISSING",
  CONTRADICTION: "CONTRADICTION",
  UNREADABLE: "UNREADABLE",
  EVIDENCE_NOT_FOUND: "EVIDENCE_NOT_FOUND",
  MIXED_UNITS: "MIXED_UNITS",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
  NOT_A_PLAN: "NOT_A_PLAN",
  TOO_MANY_DAYS: "TOO_MANY_DAYS",
  TOO_MANY_EXERCISES: "TOO_MANY_EXERCISES",
  TOO_MANY_SETS: "TOO_MANY_SETS",
} as const;

export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];

/** How a single field was resolved (drives the review status chip). */
export type ParsedFieldStatus =
  | "explicit" // the source stated it plainly
  | "derived" // computed deterministically from the source (e.g. "8" → min=max=8)
  | "missing" // the source did not state it
  | "ambiguous"; // the source stated something that cannot be read as one value

export type ParsedField<T> = {
  value: T | null;
  raw: string | null;
  status: ParsedFieldStatus;
};

/** One read-only "from your source" chip (never persisted; spec RD-3). */
export type SourceContext = { label: string; value: string };

export type ParsedPrescription = {
  sets: ParsedField<number>;
  repMin: ParsedField<number>;
  repMax: ParsedField<number>;
  /** Load/rest/tempo/%/RPE/RIR/superset: shown read-only, dropped on confirm. */
  context: SourceContext[];
  /** Codes to roll into the draft's issues[] for this exercise. */
  issues: IssueCode[];
};

const DASHES = /[‐-―−]/g; // various hyphens/minus → ascii "-"
const MULT = /[x×*]/i; // x, ×, *

function normalizeNumeric(raw: string): string {
  return raw.replace(DASHES, "-").trim();
}

function field<T>(
  value: T | null,
  raw: string | null,
  status: ParsedFieldStatus,
): ParsedField<T> {
  return { value, raw, status };
}

function missing<T>(): ParsedField<T> {
  return { value: null, raw: null, status: "missing" };
}

/** Integer in [min,max], or null. Rejects non-integers and out-of-range. */
function boundedInt(n: number, min: number, max: number): number | null {
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * Parse a sets token. Accepts a bare integer ("3") or the sets side of a "3x8"
 * style scheme when the caller splits it. Returns null when not a clean integer.
 */
function parseSets(raw: string | null): ParsedField<number> {
  if (raw == null) return missing<number>();
  const s = normalizeNumeric(raw);
  if (s === "") return missing<number>();
  const m = /^(\d{1,2})$/.exec(s);
  if (!m) return field<number>(null, raw, "ambiguous");
  const n = boundedInt(Number(m[1]), 1, MAX_SETS_PER_EXERCISE);
  return field<number>(n, raw, n === null ? "ambiguous" : "explicit");
}

/**
 * Parse a reps token into a (min,max) range. Handles:
 *   "8"        → 8..8 (derived max from a single value)
 *   "6-8"      → 6..8
 *   "6 to 8"   → 6..8
 *   "AMRAP"    → min=1, no max (surfaced; AMRAP has no top-of-range target)
 * Returns both fields plus any issue codes.
 */
function parseReps(raw: string | null): {
  repMin: ParsedField<number>;
  repMax: ParsedField<number>;
  issues: IssueCode[];
} {
  if (raw == null) {
    return { repMin: missing<number>(), repMax: missing<number>(), issues: [] };
  }
  const s = normalizeNumeric(raw).toLowerCase();
  if (s === "") {
    return { repMin: missing<number>(), repMax: missing<number>(), issues: [] };
  }

  // AMRAP: no fixed top-of-range target. Record min=1 as derived, max stays
  // missing so the progression rule has no "top of range" to hit — the lifter
  // sets a concrete range in review.
  if (/amrap|to failure|max reps/.test(s)) {
    return {
      repMin: field<number>(1, raw, "derived"),
      repMax: field<number>(null, raw, "missing"),
      issues: [ISSUE_CODES.REQUIRED_MISSING],
    };
  }

  // Range "6-8" / "6 to 8" / "6–8".
  const range = /^(\d{1,3})\s*(?:-|to)\s*(\d{1,3})$/.exec(s);
  if (range) {
    const lo = boundedInt(Number(range[1]), 1, 999);
    const hi = boundedInt(Number(range[2]), 1, 999);
    if (lo === null || hi === null || lo > hi) {
      return {
        repMin: field<number>(null, raw, "ambiguous"),
        repMax: field<number>(null, raw, "ambiguous"),
        issues: [ISSUE_CODES.VALUE_AMBIGUOUS],
      };
    }
    return {
      repMin: field<number>(lo, raw, "explicit"),
      repMax: field<number>(hi, raw, "explicit"),
      issues: [],
    };
  }

  // Single value "8" → 8..8 (max is DERIVED from the single value).
  const single = /^(\d{1,3})$/.exec(s);
  if (single) {
    const n = boundedInt(Number(single[1]), 1, 999);
    if (n === null) {
      return {
        repMin: field<number>(null, raw, "ambiguous"),
        repMax: field<number>(null, raw, "ambiguous"),
        issues: [ISSUE_CODES.VALUE_AMBIGUOUS],
      };
    }
    return {
      repMin: field<number>(n, raw, "explicit"),
      repMax: field<number>(n, raw, "derived"),
      issues: [],
    };
  }

  // Unreadable as a rep scheme.
  return {
    repMin: field<number>(null, raw, "ambiguous"),
    repMax: field<number>(null, raw, "ambiguous"),
    issues: [ISSUE_CODES.VALUE_AMBIGUOUS],
  };
}

/**
 * Parse a combined "3x8" / "4×6-8" scheme string into sets + reps. Splits on the
 * first multiplication sign; everything before is sets, everything after is reps.
 */
export function parseScheme(raw: string): {
  sets: ParsedField<number>;
  repMin: ParsedField<number>;
  repMax: ParsedField<number>;
  issues: IssueCode[];
} {
  const s = normalizeNumeric(raw);
  const idx = s.search(MULT);
  if (idx >= 0) {
    const setsRaw = s.slice(0, idx).trim();
    const repsRaw = s.slice(idx + 1).trim();
    const sets = parseSets(setsRaw || null);
    const reps = parseReps(repsRaw || null);
    return {
      sets,
      repMin: reps.repMin,
      repMax: reps.repMax,
      issues: reps.issues,
    };
  }
  // No multiplication sign: treat the whole token as a rep scheme (sets absent).
  const reps = parseReps(s || null);
  return { sets: missing<number>(), ...reps };
}

const LB = /(\b(lb|lbs|pound|pounds)\b|#)/i;
const KG = /\b(kg|kgs|kilo|kilos|kilogram|kilograms)\b/i;

/**
 * Detect mixed load units across the raw load strings of ONE exercise. Never
 * converts; only reports MIXED_UNITS so review can flag it (spec §12). A single
 * consistent unit (or no unit) is fine.
 */
export function detectMixedUnits(loadRaws: (string | null)[]): boolean {
  let sawLb = false;
  let sawKg = false;
  for (const raw of loadRaws) {
    if (raw == null) continue;
    if (LB.test(raw)) sawLb = true;
    if (KG.test(raw)) sawKg = true;
  }
  return sawLb && sawKg;
}

/** The raw strings observed for one exercise's non-plan context. */
export type ObservedContext = {
  load: string | null;
  rest: string | null;
  tempo: string | null;
  notes: string | null;
  /** Intensity like "@70%", "RPE 8", "RIR 2" may ride in load or notes. */
  groupLabel: string | null;
};

function pushContext(
  out: SourceContext[],
  label: string,
  raw: string | null,
): void {
  const v = raw?.trim();
  if (v) out.push({ label, value: v });
}

/**
 * Turn the observed strings for one exercise into Overload plan fields plus
 * read-only context and issues. `scheme` is the combined "3x8"-style string when
 * the source gave one; otherwise pass sets/reps separately.
 */
export function parsePrescription(input: {
  scheme?: string | null;
  sets?: string | null;
  reps?: string | null;
  context: ObservedContext;
}): ParsedPrescription {
  const issues: IssueCode[] = [];
  let sets: ParsedField<number>;
  let repMin: ParsedField<number>;
  let repMax: ParsedField<number>;

  if (input.scheme && input.scheme.trim() !== "") {
    const parsed = parseScheme(input.scheme);
    sets = parsed.sets;
    repMin = parsed.repMin;
    repMax = parsed.repMax;
    issues.push(...parsed.issues);
  } else {
    sets = parseSets(input.sets ?? null);
    const reps = parseReps(input.reps ?? null);
    repMin = reps.repMin;
    repMax = reps.repMax;
    issues.push(...reps.issues);
  }

  if (sets.status === "ambiguous" || repMin.status === "ambiguous") {
    if (!issues.includes(ISSUE_CODES.VALUE_AMBIGUOUS)) {
      issues.push(ISSUE_CODES.VALUE_AMBIGUOUS);
    }
  }
  if (sets.status === "missing" || repMin.status === "missing") {
    issues.push(ISSUE_CODES.REQUIRED_MISSING);
  }

  // Read-only context (never persisted). Load/rest/tempo/notes + superset label.
  const context: SourceContext[] = [];
  pushContext(context, "Load", input.context.load);
  pushContext(context, "Rest", input.context.rest);
  pushContext(context, "Tempo", input.context.tempo);
  pushContext(context, "Superset", input.context.groupLabel);
  pushContext(context, "Notes", input.context.notes);

  if (input.context.load || input.context.rest || input.context.tempo) {
    issues.push(ISSUE_CODES.OUT_OF_SCOPE);
  }

  return { sets, repMin, repMax, context, issues: dedupe(issues) };
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Structural caps (spec §12). Returned as issues, never silent truncation. */
export function capIssues(input: {
  dayCount: number;
  exerciseCountsPerDay: number[];
  setCounts: number[];
}): IssueCode[] {
  const out: IssueCode[] = [];
  if (input.dayCount > MAX_DAYS) out.push(ISSUE_CODES.TOO_MANY_DAYS);
  if (input.exerciseCountsPerDay.some((n) => n > MAX_EXERCISES_PER_DAY)) {
    out.push(ISSUE_CODES.TOO_MANY_EXERCISES);
  }
  if (input.setCounts.some((n) => n > MAX_SETS_PER_EXERCISE)) {
    out.push(ISSUE_CODES.TOO_MANY_SETS);
  }
  return out;
}
