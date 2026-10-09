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
