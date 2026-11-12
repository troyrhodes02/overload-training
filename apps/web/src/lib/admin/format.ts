/**
 * Admin-area date wording (Admin Center & Feedback design doc §4): "Today",
 * "Oct 21" within the reference year, "Oct 21, 2025" otherwise; full dates on
 * detail pages; times only in the audit log, in the admin's timezone. Pure
 * and client-safe.
 */

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A calendar date in a list: "Today", "Oct 21", or "Oct 21, 2025". */
export function shortDate(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Today";
  const sameYear = iso.slice(0, 4) === todayIso.slice(0, 4);
  return (sameYear ? MONTH_DAY : MONTH_DAY_YEAR).format(utc(iso));
}

/** A calendar date on a detail page: "Oct 21, 2026". */
export function fullDate(iso: string): string {
  return MONTH_DAY_YEAR.format(utc(iso));
}

/** A signup cohort month: "Oct 2026". */
export function monthLabel(month: string): string {
  return MONTH_YEAR.format(utc(`${month}-01`));
}

/** An instant's calendar day in a timezone: "Oct 21" (or with the year). */
export function instantDate(
  isoInstant: string,
  timeZone: string,
  withYear = false,
): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone,
  }).format(new Date(isoInstant));
}

/** An instant in a timezone: "Oct 21, 2026 · 2:14 PM". */
export function instantLabel(
  isoInstant: string,
  timeZone: string,
  withYear = true,
): string {
  const d = new Date(isoInstant);
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone,
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(d);
  return `${date} · ${time}`;
}

/** "46% of registered", or "—" when there is nothing to divide by. */
export function percentOf(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
