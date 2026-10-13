import { addDays, isoWeekday, mesocycleWeekForDate } from "@/lib/plan/calendar";

/** Mesocycle week for a date, defaulting to week 1 before the start. */
export function mesocycleWeek(startDate: string, dateIso: string): number {
  return mesocycleWeekForDate(startDate, dateIso) ?? 1;
}

/**
 * Effective-schedule derivation for Guided Workout Logging (Resolved Decisions
 * 2, 30, 36–38, A1, A4). Pure module — the single place the authored plan plus
 * dated missed-day resolutions become the REAL training calendar. It never reads
 * or writes the database; a query module gathers the inputs and passes them in.
 *
 * Week math is anchored by src/lib/plan/calendar.ts (the one week-math authority):
 * mesocycle week n covers startDate + 7(n-1) … +7n-1, and a scheduled Session on
 * ISO weekday `dayOfWeek` falls on the unique date in that 7-day block whose
 * weekday matches. Shifts are computed INDEPENDENTLY per week, so a shift never
 * crosses a week boundary and nothing compounds across weeks.
 *
 * All dates are "YYYY-MM-DD" strings, which compare lexicographically === chronologically.
 */

export type ScheduleSession = { id: string; name: string; dayOfWeek: number };
export type ScheduleResolution = {
  missedOn: string;
  outcome: "logged_late" | "shifted" | "skipped";
};
export type ScheduleLoggedSession = {
  sessionId: string;
  scheduledFor: string;
  status: "in_progress" | "complete";
};

export type ScheduleContext = {
  startDate: string;
  lengthWeeks: number;
  /** Scheduled sessions only (dayOfWeek 1–7). */
  sessions: ScheduleSession[];
  resolutions: ScheduleResolution[];
  loggedSessions: ScheduleLoggedSession[];
};

export type EffectiveOccurrence = {
  sessionId: string;
  sessionName: string;
  dayOfWeek: number;
  week: number;
  /** Stable identity date (the Session's authored date in this week). */
  authoredIso: string;
  /** Where it actually lands after shifts; null if a shift dropped it past the week. */
  effectiveIso: string | null;
  resolution: "logged_late" | "shifted" | "skipped" | null;
  loggedStatus: "in_progress" | "complete" | null;
  dropped: boolean;
};

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The authored calendar date of a scheduled Session in a given mesocycle week. */
export function authoredDate(
  startDate: string,
  week: number,
  dayOfWeek: number,
): string {
  const weekStart = addDays(startDate, (week - 1) * 7);
  const offset = (((dayOfWeek - isoWeekday(weekStart)) % 7) + 7) % 7;
  return addDays(weekStart, offset);
}

/**
 * The effective occurrences for one mesocycle week, applying that week's
 * resolutions in chronological order:
 *  - skipped: the occurrence is resolved; no loggable slot.
 *  - logged_late: the occurrence is resolved; stays at its authored date.
 *  - shifted: the missed occurrence and every later same-week occurrence move
 *    forward one calendar day; any pushed beyond the week's last day is dropped.
 */
export function effectiveWeekSchedule(
  ctx: ScheduleContext,
  week: number,
): EffectiveOccurrence[] {
  const weekStart = addDays(ctx.startDate, (week - 1) * 7);
  const weekEnd = addDays(weekStart, 6);

  const occ: EffectiveOccurrence[] = ctx.sessions.map((s) => {
    const authoredIso = authoredDate(ctx.startDate, week, s.dayOfWeek);
    return {
      sessionId: s.id,
      sessionName: s.name,
      dayOfWeek: s.dayOfWeek,
      week,
      authoredIso,
      effectiveIso: authoredIso,
      resolution: null,
      loggedStatus: null,
      dropped: false,
    };
  });

  const weekResolutions = ctx.resolutions
    .filter(
      (r) => cmp(r.missedOn, weekStart) >= 0 && cmp(r.missedOn, weekEnd) <= 0,
    )
    .sort((a, b) => cmp(a.missedOn, b.missedOn));

  for (const r of weekResolutions) {
    const target = occ.find((o) => o.authoredIso === r.missedOn);
    if (!target) continue;
    if (r.outcome === "skipped") {
      target.resolution = "skipped";
    } else if (r.outcome === "logged_late") {
      target.resolution = "logged_late";
    } else {
      // shifted: move this occurrence and all later unresolved ones forward a day.
      target.resolution = "shifted";
      for (const o of occ) {
        if (o.resolution === "skipped") continue;
        if (o.dropped || o.effectiveIso === null) continue;
        if (cmp(o.authoredIso, r.missedOn) < 0) continue;
        const next = addDays(o.effectiveIso, 1);
        if (cmp(next, weekEnd) > 0) {
          o.dropped = true;
          o.effectiveIso = null;
        } else {
          o.effectiveIso = next;
        }
      }
    }
  }

  // Attach logged status by stable authored identity (not the shifted date).
  for (const o of occ) {
    const ls = ctx.loggedSessions.find(
      (l) => l.sessionId === o.sessionId && l.scheduledFor === o.authoredIso,
    );
    o.loggedStatus = ls ? ls.status : null;
  }

  return occ.sort((a, b) => cmp(a.authoredIso, b.authoredIso));
}

/**
 * The earliest planned occurrence that is genuinely missed: effective date in
 * the past, no resolution, and no LoggedSession at all (an in-progress session
 * is resumable, not missed). Scanned chronologically across weeks up to today.
 */
export function oldestUnresolvedMissedDay(
  ctx: ScheduleContext,
  todayIso: string,
): EffectiveOccurrence | null {
  const currentWeek = mesocycleWeekForDate(ctx.startDate, todayIso) ?? 1;
  const lastWeek = Math.min(currentWeek, ctx.lengthWeeks);
  let best: EffectiveOccurrence | null = null;
  for (let w = 1; w <= lastWeek; w++) {
    for (const o of effectiveWeekSchedule(ctx, w)) {
      if (o.resolution) continue;
      if (o.dropped || o.effectiveIso === null) continue;
      if (o.loggedStatus) continue;
      if (cmp(o.effectiveIso, todayIso) >= 0) continue;
      if (best === null || cmp(o.effectiveIso, best.effectiveIso!) < 0)
        best = o;
    }
  }
  return best;
}

/** The occurrence effectively scheduled for a given day (today), if any. */
export function occurrenceOnDate(
  ctx: ScheduleContext,
  dateIso: string,
): EffectiveOccurrence | null {
  const week = mesocycleWeekForDate(ctx.startDate, dateIso);
  if (week === null || week < 1 || week > ctx.lengthWeeks) return null;
  for (const o of effectiveWeekSchedule(ctx, week)) {
    if (o.resolution === "skipped" || o.dropped) continue;
    if (o.effectiveIso === dateIso) return o;
  }
  return null;
}
