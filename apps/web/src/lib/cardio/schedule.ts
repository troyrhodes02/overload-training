import { addDays } from "@/lib/plan/calendar";
import {
  authoredDate,
  effectiveWeekSchedule,
  type EffectiveOccurrence,
  type ScheduleContext,
} from "@/lib/logging/schedule";

/**
 * Cardio occurrences (Cardio Logging spec §11b, R38–R40, R54–R57). Pure
 * module: it CONSUMES Pitch 4's effective schedule and never re-implements it.
 *
 *  - A planned cardio item on a weekday that also has a scheduled lifting
 *    Session is BOUND to that Session's occurrence: it lands on the
 *    occurrence's effective date, so a lifting shift carries it, and it drops
 *    out of the week if the shift drops the Session.
 *  - A cardio-only weekday is UNBOUND: always its authored date. Nothing moves
 *    it, and it never moves anything — the missed-day engine never sees cardio.
 *  - An occurrence exists only from its plan row's creation date onward (the
 *    occurrence floor), so cardio added mid-block never invents past misses.
 *  - A CardioLog shows on the day it was performed (its stored performedOn:
 *    the occurrence's effective date when it was logged), so a LATER lifting
 *    shift never moves cardio that was already done; and it stays visible
 *    even if its plan row was later moved or removed.
 *
 * Nothing here knows about progression, e1RM, goals, gyms, or deload: a
 * scheduled-deload week leaves cardio exactly as authored.
 *
 * All dates are "YYYY-MM-DD" strings (UTC calendar), compared lexicographically.
 */

export type PlannedCardioInput = {
  id: string;
  dayOfWeek: number;
  type: string;
  durationMin: number;
  /** UTC calendar date the plan row was created (the occurrence floor). */
  createdIso: string;
};

export type CardioLogInput = {
  id: string;
  scheduledFor: string;
  type: string;
  durationMin: number;
  plannedType: string;
  plannedDurationMin: number;
  /** The day it was performed (UTC calendar date of performedOn). */
  performedIso: string;
};

export type CardioOccurrence = {
  dayOfWeek: number;
  week: number;
  /** Stable identity date: the planned day's authored date in this week. */
  authoredIso: string;
  /** Where it lands after any lifting shift; null if the shift dropped it. */
  effectiveIso: string | null;
  bound: boolean;
  type: string;
  durationMin: number;
};

export type CardioState = "complete" | "pending" | "upcoming" | "missed";

export type CardioEntry = {
  /** Authored date — the CardioLog identity with the mesocycle. */
  scheduledFor: string;
  /** Effective date — where the entry shows. */
  dateIso: string;
  planned: { type: string; durationMin: number };
  state: CardioState;
  log: { id: string; type: string; durationMin: number } | null;
  differsFromPlan: boolean;
};

/**
 * Where whatever is planned on `dayOfWeek` lands this week, given the week's
 * lifting occurrences (computed ONCE per week by the caller).
 */
function placement(
  ctx: ScheduleContext,
  lifting: EffectiveOccurrence[],
  week: number,
  dayOfWeek: number,
): { authoredIso: string; effectiveIso: string | null; bound: boolean } {
  const authoredIso = authoredDate(ctx.startDate, week, dayOfWeek);
  const bound = lifting.find((o) => o.dayOfWeek === dayOfWeek);
  if (!bound) return { authoredIso, effectiveIso: authoredIso, bound: false };
  return {
    authoredIso,
    effectiveIso: bound.dropped ? null : bound.effectiveIso,
    bound: true,
  };
}

/** Every planned cardio occurrence in one mesocycle week (authored order). */
export function cardioWeekOccurrences(
  ctx: ScheduleContext,
  planned: PlannedCardioInput[],
  week: number,
): CardioOccurrence[] {
  if (week < 1 || week > ctx.lengthWeeks) return [];
  const lifting = effectiveWeekSchedule(ctx, week);
  return planned
    .flatMap((p) => {
      const at = placement(ctx, lifting, week, p.dayOfWeek);
      if (at.authoredIso < p.createdIso) return [];
      return [
        {
          dayOfWeek: p.dayOfWeek,
          week,
          ...at,
          type: p.type,
          durationMin: p.durationMin,
        },
      ];
    })
    .sort((a, b) => (a.authoredIso < b.authoredIso ? -1 : 1));
}

/** Logged ⇒ complete; otherwise by effective date against today. */
export function cardioState(
  effectiveIso: string,
  logged: boolean,
  todayIso: string,
): CardioState {
  if (logged) return "complete";
  if (effectiveIso === todayIso) return "pending";
  return effectiveIso > todayIso ? "upcoming" : "missed";
}

/**
 * The cardio entries of one mesocycle week: planned occurrences (with their
 * state) merged with that week's CardioLogs by authored date. A log always
 * wins over the plan (its snapshot is what was planned when it was logged)
 * and shows on the day it was performed; a logged occurrence whose plan row is
 * gone still appears; an unlogged occurrence a shift dropped does not. Sorted
 * by effective date, then authored date.
 */
export function cardioWeekEntries(
  ctx: ScheduleContext,
  planned: PlannedCardioInput[],
  logs: CardioLogInput[],
  week: number,
  todayIso: string,
): CardioEntry[] {
  if (week < 1 || week > ctx.lengthWeeks) return [];
  const weekStart = addDays(ctx.startDate, (week - 1) * 7);
  const weekEnd = addDays(weekStart, 6);
  const byDate = new Map<string, CardioEntry>();

  for (const o of cardioWeekOccurrences(ctx, planned, week)) {
    if (o.effectiveIso === null) continue;
    byDate.set(o.authoredIso, {
      scheduledFor: o.authoredIso,
      dateIso: o.effectiveIso,
      planned: { type: o.type, durationMin: o.durationMin },
      state: cardioState(o.effectiveIso, false, todayIso),
      log: null,
      differsFromPlan: false,
    });
  }

  for (const l of logs) {
    if (l.scheduledFor < weekStart || l.scheduledFor > weekEnd) continue;
    const planned = { type: l.plannedType, durationMin: l.plannedDurationMin };
    byDate.set(l.scheduledFor, {
      scheduledFor: l.scheduledFor,
      dateIso: l.performedIso,
      planned,
      state: "complete",
      log: { id: l.id, type: l.type, durationMin: l.durationMin },
      differsFromPlan:
        l.type !== planned.type || l.durationMin !== planned.durationMin,
    });
  }

  return [...byDate.values()].sort((a, b) =>
    a.dateIso !== b.dateIso
      ? a.dateIso < b.dateIso
        ? -1
        : 1
      : a.scheduledFor < b.scheduledFor
        ? -1
        : 1,
  );
}
