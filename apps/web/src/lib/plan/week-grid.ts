/**
 * The plan week on the phone (Pitch 21h spec §4): pure shaping of what the
 * schedule reads already decided. No date rule lives here that is not the
 * shared calendar's: weeks come from `mesocycleWeekForDate` and
 * `plannedEndDate`, deload weeks from `isScheduledDeloadWeek`, occurrences and
 * their states from the effective schedule (getWeekScheduleWithSessions).
 * This module only lays them on seven dated days.
 */
import type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";
import type { WeekDayState } from "@overload/shared/contracts/logging";
import type {
  PlanBlockPosition,
  PlanDayDto,
} from "@overload/shared/contracts/plan";
import {
  addDays,
  formatPlanDate,
  mesocycleWeekForDate,
  plannedEndDate,
} from "@overload/shared/plan/calendar";
import { isScheduledDeloadWeek } from "@overload/shared/progression/deload";

/** Every scheduled-deload week of a block: N, 2N, … up to its length. */
export function deloadWeeksOf(
  lengthWeeks: number,
  deloadEveryWeeks: number,
): number[] {
  const weeks: number[] = [];
  for (let w = 1; w <= lengthWeeks; w++) {
    if (isScheduledDeloadWeek(w, deloadEveryWeeks)) weeks.push(w);
  }
  return weeks;
}

/** Where today sits in a block: before it, in week n, or after its planned end. */
export function blockPosition(
  block: { startDate: string; lengthWeeks: number; deloadEveryWeeks: number },
  today: string,
): PlanBlockPosition {
  const week = mesocycleWeekForDate(block.startDate, today);
  if (week === null) return { kind: "upcoming", startsOn: block.startDate };
  if (week > block.lengthWeeks) {
    return {
      kind: "ended",
      endedOn: plannedEndDate(block.startDate, block.lengthWeeks),
    };
  }
  return {
    kind: "running",
    week,
    scheduledDeloadWeek: isScheduledDeloadWeek(week, block.deloadEveryWeeks),
  };
}

export type WeekOccurrence = {
  dateIso: string;
  sessionId: string;
  sessionName: string;
  state: WeekDayState;
  loggedSessionId: string | null;
};

/**
 * The seven days of one block week, in date order. Each day gets the
 * occurrences and cardio the schedule placed on it (by effective date), so a
 * shifted session sits where it landed and a day with none is a rest day.
 */
export function planWeekDays(args: {
  weekStart: string;
  today: string;
  occurrences: readonly WeekOccurrence[];
  cardio: readonly CardioOccurrenceDto[];
}): PlanDayDto[] {
  return Array.from({ length: 7 }, (_, i) => {
    const dateIso = addDays(args.weekStart, i);
    return {
      dateIso,
      dayLabel: formatPlanDate(dateIso),
      isToday: dateIso === args.today,
      sessions: args.occurrences
        .filter((o) => o.dateIso === dateIso)
        .map(({ sessionId, sessionName, state, loggedSessionId }) => ({
          sessionId,
          sessionName,
          state,
          loggedSessionId,
        })),
      cardio: args.cardio.filter((c) => c.dateIso === dateIso),
    };
  });
}
