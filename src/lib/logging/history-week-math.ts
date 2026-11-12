import { addDays, isoWeekday, parseIsoDate } from "@/lib/plan/calendar";

/**
 * Week math for all-time history (OVE-141). Pure: no database, framework, or
 * server dependency, so the web page, the query module, and a future mobile
 * client compute weeks the same way.
 */

/** The start of the week containing `iso`, for weeks starting on `anchorDow`. */
export function weekStartFor(iso: string, anchorDow: number): string {
  const back = (isoWeekday(iso) - anchorDow + 7) % 7;
  return addDays(iso, -back);
}

/**
 * Resolve the requested week to the start date of a week. Accepts a date
 * ("YYYY-MM-DD", any day of the week) or, for links made before all-time
 * history, an active-block week number ("3"). Anything else means this week.
 */
export function resolveRequestedWeek(
  requested: string | null | undefined,
  ctx: {
    thisWeekStart: string;
    anchorDow: number;
    active: { startDate: string; lengthWeeks: number } | null;
  },
): string {
  const raw = (requested ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && parseIsoDate(raw)) {
    return weekStartFor(raw, ctx.anchorDow);
  }
  if (/^\d{1,3}$/.test(raw) && ctx.active) {
    const n = Number(raw);
    if (n >= 1 && n <= ctx.active.lengthWeeks) {
      return addDays(ctx.active.startDate, (n - 1) * 7);
    }
  }
  return ctx.thisWeekStart;
}
