/**
 * Mesocycle calendar semantics (spec D59). The ONLY place week math happens,
 * so later features (Guided Workout Logging, the scheduled deload) can never
 * disagree about which week a date falls in.
 *
 *  - A start date is a calendar date, carried as "YYYY-MM-DD". All arithmetic
 *    is done on UTC midnights; local time zones never enter it.
 *  - Weeks are 7-day blocks anchored at the start date, whatever its weekday.
 *    Week n covers start + 7(n-1) … start + 7n - 1.
 *  - Sessions sit on ISO weekdays (1 = Monday … 7 = Sunday) and repeat weekly.
 *  - Planned end = start + 7·length - 1; a clone defaults to end + 1.
 *
 * Pure module: safe for client islands.
 */

export const DAYS_OF_WEEK = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 7, short: "Sun", long: "Sunday" },
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function dayName(dayOfWeek: number): string {
  return DAYS_OF_WEEK[dayOfWeek - 1]?.long ?? "";
}

export function dayShort(dayOfWeek: number): string {
  return DAYS_OF_WEEK[dayOfWeek - 1]?.short ?? "";
}

/** "2026-11-02" → Date at 00:00 UTC, or null if it isn't a real date. */
export function parseIsoDate(value: string): Date | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

/** Date (any time) → its UTC calendar date as "YYYY-MM-DD". */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const date = parseIsoDate(iso);
  if (!date) throw new Error(`Not a calendar date: ${iso}`);
  return ((date.getUTCDay() + 6) % 7) + 1;
}

/** True for an IANA time zone this runtime understands ("America/Chicago"). */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date ("YYYY-MM-DD") an instant falls on in a time zone. */
export function isoDateInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * "Today" as a calendar date in the lifter's time zone — the one place it is
 * defined, so every surface agrees on what today is. Server code passes the
 * acting account's stored zone (Profile.timeZone via accountToday in
 * src/lib/data/account.ts — Multi-User Foundation); without one it is the
 * UTC date. All date ARITHMETIC stays on UTC midnights
 * (above) — only the choice of which calendar day is "today" is zone-aware.
 */
export function todayIso(timeZone = "UTC", now: Date = new Date()): string {
  return isoDateInZone(now, timeZone);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) throw new Error(`Not a calendar date: ${iso}`);
  return toIsoDate(new Date(date.getTime() + days * DAY_MS));
}

/** Last calendar day of the block. */
export function plannedEndDate(startDate: string, lengthWeeks: number): string {
  return addDays(startDate, lengthWeeks * 7 - 1);
}

/** A clone starts the day after its source's planned end (spec D35). */
export function cloneDefaultStartDate(
  startDate: string | null,
  lengthWeeks: number,
): string | null {
  return startDate ? addDays(startDate, lengthWeeks * 7) : null;
}

/**
 * Which week of the block a calendar date falls in (1-based), or null before
 * the start. Dates after the planned end return a week > lengthWeeks; callers
 * decide what that means. Defined here for later pitches; no Pitch 3 UI uses it.
 */
export function mesocycleWeekForDate(
  startDate: string,
  date: string,
): number | null {
  const start = parseIsoDate(startDate);
  const target = parseIsoDate(date);
  if (!start || !target) return null;
  const diff = Math.round((target.getTime() - start.getTime()) / DAY_MS);
  return diff < 0 ? null : Math.floor(diff / 7) + 1;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "2026-11-02" → "Mon, Nov 2". */
export function formatPlanDate(iso: string): string {
  const date = parseIsoDate(iso);
  return date ? DATE_FMT.format(date) : iso;
}

/** "Mon, Sep 28 – Sun, Nov 1". */
export function formatPlanRange(startIso: string, endIso: string): string {
  return `${formatPlanDate(startIso)} – ${formatPlanDate(endIso)}`;
}
