/**
 * Parse the optional end date of a complimentary-access grant (OVE-127 /
 * audit F-A16). The admin form sends a date input ("YYYY-MM-DD"); an ISO
 * date-time is accepted too. Returns null for "no end date", a Date for a real
 * calendar date, or "invalid" for anything else — including impossible dates
 * like 2026-02-30, which `new Date` would silently roll forward. Whether the
 * date is in the future is the caller's check.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseCompEndsAt(raw: unknown): Date | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return "invalid";
  const value = raw.trim();
  if (value === "") return null;
  if (DATE_ONLY.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return "invalid";
    return date.toISOString().slice(0, 10) === value ? date : "invalid";
  }
  if (DATE_TIME.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "invalid" : date;
  }
  return "invalid";
}
