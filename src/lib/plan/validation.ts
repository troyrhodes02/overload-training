/**
 * Plan input validation (spec "Validation Rules", D21, D22, D51, D61).
 *
 * Structurally invalid input is blocked; user-entered numbers are never
 * "fixed" (a 10–8 rep range is an error, not a silently swapped 8–10). The
 * upper bounds are input-sanity limits, not product rules.
 *
 * Pure module: the forms run the same checks before submitting.
 */
import { parseIsoDate } from "./calendar";
import { isSplitType, type SplitTypeValue } from "./presets";

export const PLAN_NAME_MAX = 80;
export const LENGTH_WEEKS_MAX = 52;
export const PLANNED_SETS_MAX = 20;
export const REPS_MAX = 100;

/** The 5-week / deload-week-5 pre-fill (spec D6, D7). A default, never a rule. */
export const DEFAULT_LENGTH_WEEKS = 5;
export const DEFAULT_DELOAD_WEEK = 5;

type Details = Record<string, string>;
export type Parsed<T> =
  { ok: true; value: T } | { ok: false; details: Details };

/** Whole numbers only: "3" or 3. Rejects "", "3.5", "-1", "1e2", " 3x". */
export function parseWholeNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number(t);
}

export function parseName(raw: unknown, details: Details, key = "name") {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length === 0) details[key] = "Enter a name.";
  else if (name.length > PLAN_NAME_MAX)
    details[key] = `Keep the name to ${PLAN_NAME_MAX} characters or fewer.`;
  return name;
}

export type MesocycleDetailsInput = {
  name: string;
  startDate: string | null;
  lengthWeeks: number;
  deloadWeek: number;
};

export type RawMesocycleDetails = {
  name?: unknown;
  startDate?: unknown;
  lengthWeeks?: unknown;
  deloadWeek?: unknown;
};

/**
 * Name, start date, length, deload week. A deload week past the end of the
 * block is NOT an error here: a draft may hold it (it is a readiness issue),
 * and the active-block rule is enforced by the write module (spec D61).
 */
export function parseMesocycleDetails(
  raw: RawMesocycleDetails,
): Parsed<MesocycleDetailsInput> {
  const details: Details = {};
  const name = parseName(raw.name, details);

  let startDate: string | null = null;
  const startRaw =
    typeof raw.startDate === "string" ? raw.startDate.trim() : "";
  if (raw.startDate != null && typeof raw.startDate !== "string") {
    details.startDate = "Enter a valid date.";
  } else if (startRaw.length > 0) {
    if (parseIsoDate(startRaw)) startDate = startRaw;
    else details.startDate = "Enter a valid date.";
  }

  const lengthWeeks = parseWholeNumber(raw.lengthWeeks);
  if (lengthWeeks === null || lengthWeeks < 1)
    details.lengthWeeks = "Enter a whole number of weeks, 1 or more.";
  else if (lengthWeeks > LENGTH_WEEKS_MAX)
    details.lengthWeeks = `Keep it to ${LENGTH_WEEKS_MAX} weeks or fewer.`;

  const deloadWeek = parseWholeNumber(raw.deloadWeek);
  if (deloadWeek === null || deloadWeek < 1)
    details.deloadWeek = "Enter a whole number, 1 or more.";
  else if (deloadWeek > LENGTH_WEEKS_MAX)
    details.deloadWeek = `Keep it to week ${LENGTH_WEEKS_MAX} or earlier.`;

  if (Object.keys(details).length > 0) return { ok: false, details };
  return {
    ok: true,
    value: {
      name,
      startDate,
      lengthWeeks: lengthWeeks as number,
      deloadWeek: deloadWeek as number,
    },
  };
}

/** The non-blocking deload warning both forms show (spec D7). */
export function deloadOutOfRangeMessage(
  deloadWeek: number,
  lengthWeeks: number,
): string | null {
  if (deloadWeek <= lengthWeeks) return null;
  return `Week ${deloadWeek} is past the end of a ${lengthWeeks}-week block. Choose a week from 1 to ${lengthWeeks}.`;
}

export function parseSplitType(raw: unknown): Parsed<SplitTypeValue> {
  return isSplitType(raw)
    ? { ok: true, value: raw }
    : { ok: false, details: { splitType: "Choose a structure." } };
}

/** A session's day: 1–7, or null for "Not on the schedule". */
export function parseDayOfWeek(raw: unknown): Parsed<number | null> {
  if (raw === null || raw === "" || raw === "none")
    return { ok: true, value: null };
  const day = parseWholeNumber(raw);
  return day !== null && day >= 1 && day <= 7
    ? { ok: true, value: day }
    : { ok: false, details: { dayOfWeek: "Choose a day." } };
}

export type PlannedExerciseInput = {
  plannedSets: number;
  targetRepMin: number;
  targetRepMax: number;
};

export function parsePlannedExercise(raw: {
  plannedSets?: unknown;
  targetRepMin?: unknown;
  targetRepMax?: unknown;
}): Parsed<PlannedExerciseInput> {
  const details: Details = {};
  const sets = parseWholeNumber(raw.plannedSets);
  if (sets === null || sets < 1) details.plannedSets = "Enter at least 1 set.";
  else if (sets > PLANNED_SETS_MAX)
    details.plannedSets = `Keep sets to ${PLANNED_SETS_MAX} or fewer.`;

  const min = parseWholeNumber(raw.targetRepMin);
  if (min === null || min < 1) details.targetRepMin = "Enter at least 1 rep.";
  else if (min > REPS_MAX)
    details.targetRepMin = `Keep reps to ${REPS_MAX} or fewer.`;

  const max = parseWholeNumber(raw.targetRepMax);
  if (max === null || max < 1) details.targetRepMax = "Enter at least 1 rep.";
  else if (max > REPS_MAX)
    details.targetRepMax = `Keep reps to ${REPS_MAX} or fewer.`;
  else if (min !== null && min >= 1 && max < min)
    details.targetRepMax = "The top of the range can't be below the bottom.";

  if (Object.keys(details).length > 0) return { ok: false, details };
  return {
    ok: true,
    value: {
      plannedSets: sets as number,
      targetRepMin: min as number,
      targetRepMax: max as number,
    },
  };
}
