/**
 * The words for workouts left unfinished on an earlier day (Pitch 21g
 * OVE-228), shared so the web and the iPhone say exactly the same thing.
 * Pure: it only formats what the server's `unfinishedWorkouts` states.
 */
import { formatPlanDate } from "../plan/calendar";

export type UnfinishedWorkoutFacts = {
  sessionName: string;
  scheduledFor: string;
  gymName: string | null;
  setsLogged: number;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** The reminder's heading: "Unfinished workout" or "2 unfinished workouts". */
export function unfinishedHeading(count: number): string {
  return count === 1 ? "Unfinished workout" : `${count} unfinished workouts`;
}

/** One workout's line: "Upper A · Thu, Nov 19 · 5 sets saved". */
export function unfinishedLine(w: UnfinishedWorkoutFacts): string {
  return [
    w.sessionName,
    formatPlanDate(w.scheduledFor),
    plural(w.setsLogged, "set saved", "sets saved"),
  ].join(" · ");
}

/** Why it's shown, and what the lifter can do (never a verdict). */
export function unfinishedExplanation(count: number): string {
  return count === 1
    ? "Started on an earlier day and still in progress. Resume it to log the rest, or finish it with what you saved."
    : "Started on earlier days and still in progress. Each keeps its own date and sets.";
}

/**
 * The warning before another workout starts while one is unfinished. It
 * names what is about to start: today's workout, or (from "log it late") a
 * past day's (review of the 21g corrections #2).
 */
export function startWhileUnfinished(
  w: UnfinishedWorkoutFacts,
  starting: { scheduledFor: string; today: string },
): {
  title: string;
  message: string;
  resume: string;
  startAnyway: string;
} {
  const isToday = starting.scheduledFor === starting.today;
  const what = isToday
    ? "today's workout"
    : `${formatPlanDate(starting.scheduledFor)}'s workout`;
  return {
    title: "You have an unfinished workout",
    message: `${w.sessionName} from ${formatPlanDate(w.scheduledFor)} is still in progress. Resume it, or start ${what} and come back to it later.`,
    resume: `Resume ${w.sessionName}`,
    startAnyway: isToday ? "Start today's anyway" : "Start it anyway",
  };
}

/** How many unfinished workouts Today lists before "more in History". */
export const UNFINISHED_SHOWN = 5;

/** The line under a long list: "2 more are in History." (null when none). */
export function unfinishedMore(count: number): string | null {
  const more = count - UNFINISHED_SHOWN;
  if (more <= 0) return null;
  return `${more} more ${more === 1 ? "is" : "are"} in History.`;
}
