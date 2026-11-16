import { parseIsoDate, todayIso } from "@overload/shared/plan/calendar";

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * Today's date in the account's time zone, as "Saturday, November 14"
 * (design T1). The calendar date comes from the shared `todayIso`, the same
 * function the server uses. The app shows the server's `today`; this stays
 * for the Hermes date checks (21d spec §12).
 */
export function accountTodayLabel(
  timeZone: string,
  now: Date = new Date(),
): string {
  return longDateLabel(todayIso(timeZone, now));
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  timeZone: "UTC",
});

/**
 * A server calendar date (an account-local IsoDate) as "Saturday, November
 * 15". The date is the server's; only the wording is formatted here, on the
 * UTC midnight of that date so the device zone can't shift it.
 */
export function longDateLabel(iso: string): string {
  const date = parseIsoDate(iso);
  return date ? LONG_DATE.format(date) : iso;
}

/** A server calendar date's weekday: "Tuesday". */
export function weekdayLabel(iso: string): string {
  const date = parseIsoDate(iso);
  return date ? WEEKDAY.format(date) : iso;
}
