import type {
  ThisWeekDay,
  ThisWeekDto,
  ThisWeekWorkout,
} from "@overload/shared/contracts/schedule";

/**
 * This week's strip, as the phone shows it (OVE-241; chore spec §3). Pure:
 * every state, date, and "can this move" comes from the server's week. This
 * module only chooses words (the web strip's own) and which controls show.
 */

const STATE_WORDS: Record<ThisWeekWorkout["state"], string> = {
  upcoming: "planned",
  in_progress: "in progress",
  complete: "done",
  skipped: "skipped",
};

/** A cell's one-line label: the workout, "Rest", or "Skipped". */
export function cellLabel(day: ThisWeekDay): string {
  if (day.workout) return day.workout.sessionName;
  return day.skipped.length > 0 ? "Skipped" : "Rest";
}

/** VoiceOver's sentence for a cell (the web's aria-label). */
export function dayLabel(day: ThisWeekDay): string {
  const parts = [day.dayLabel];
  if (day.isToday) parts.push("today");
  parts.push(
    day.workout
      ? `${day.workout.sessionName}, ${STATE_WORDS[day.workout.state]}`
      : "rest day",
  );
  for (const s of day.skipped) parts.push(`${s.sessionName} skipped`);
  return parts.join(", ");
}

/** The heading: "This week · Week 3 of 5" (+ " · Deload week"). */
export function weekHeading(week: ThisWeekDto): string {
  return `This week · Week ${week.weekNumber} of ${week.lengthWeeks}${week.scheduledDeloadWeek ? " · Deload week" : ""}`;
}

export function stateWord(w: ThisWeekWorkout): string | null {
  return w.state === "upcoming" ? null : STATE_WORDS[w.state];
}

/** The day's row in the preview: "Wed, Nov 25" or "… · earlier this week". */
export function previewDateLine(day: ThisWeekDay): string {
  return `${day.dayLabel}${day.isPast ? " · earlier this week" : ""}`;
}

export type DayActions = {
  trainToday: boolean;
  swap: boolean;
  skip: boolean;
  /** The web's note when Train today isn't offered because today is taken. */
  takenNote: string | null;
};

/** Which of this week's changes a day's workout offers (the web strip's rules). */
export function dayActions(week: ThisWeekDto, day: ThisWeekDay): DayActions {
  const w = day.workout;
  const none = { trainToday: false, swap: false, skip: false, takenNote: null };
  if (!w || !w.adjustable || week.blockedReason) return none;
  if (day.isToday)
    return { trainToday: false, swap: true, skip: true, takenNote: null };
  const taken = week.days.find((d) => d.isToday)?.workout ?? null;
  return {
    trainToday: taken === null,
    swap: true,
    skip: true,
    takenNote:
      taken === null
        ? null
        : taken.adjustable
          ? `Today already has ${taken.sessionName}. To train ${w.sessionName} today, swap the two days.`
          : `Today already has ${taken.sessionName}, so ${w.sessionName} stays on another day.`,
  };
}

export type SwapOption = {
  day: ThisWeekDay;
  /** "Today" or "Thu, Nov 26". */
  label: string;
  /** "Upper A" or "Rest". */
  holds: string;
  /** Why it can't be chosen ("done", "started", "can't move"), or null. */
  blocked: string | null;
};

/** The days a workout can swap with: this week, today or later, not its own. */
export function swapOptions(
  week: ThisWeekDto,
  from: ThisWeekDay,
): SwapOption[] {
  return week.days
    .filter((d) => !d.isPast && d.dateIso !== from.dateIso)
    .map((d) => {
      const w = d.workout;
      const blocked =
        w && !w.adjustable
          ? w.state === "complete"
            ? "done"
            : w.state === "in_progress"
              ? "started"
              : "can't move"
          : null;
      return {
        day: d,
        label: d.isToday ? "Today" : d.dayLabel,
        holds: w ? w.sessionName : "Rest",
        blocked,
      };
    });
}

/** "This week after the swap": the two lines the web shows. */
export function afterSwapLines(
  from: ThisWeekDay,
  workout: ThisWeekWorkout,
  to: ThisWeekDay,
): [string, string] {
  const name = (d: ThisWeekDay) => (d.isToday ? "Today" : d.dayLabel);
  return [
    `${name(from)}: ${to.workout ? to.workout.sessionName : "Rest"}`,
    `${name(to)}: ${workout.sessionName}`,
  ];
}

/** The skip confirmation (the web dialog's words). */
export function skipConfirmation(
  day: ThisWeekDay,
  w: ThisWeekWorkout,
): { title: string; message: string } {
  return {
    title: `Skip ${w.sessionName} this week?`,
    message: `${w.sessionName} on ${day.isToday ? "today" : day.dayLabel} is marked skipped. It won't come back as a missed workout, and next week is unchanged. A skip can't be undone.`,
  };
}

/** The Train today confirmation (the web dialog's words). */
export function trainTodayConfirmation(
  day: ThisWeekDay,
  w: ThisWeekWorkout,
): { title: string; message: string } {
  return {
    title: `Train ${w.sessionName} today?`,
    message: `${w.sessionName} moves from ${day.dayLabel} to today, for this week only. ${day.weekday} becomes a rest day. Next week is unchanged. Then choose your gym to start.`,
  };
}
