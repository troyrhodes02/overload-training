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

/** The warning before another workout starts while one is unfinished. */
export function startWhileUnfinished(w: UnfinishedWorkoutFacts): {
  title: string;
  message: string;
  resume: string;
  startAnyway: string;
} {
  return {
    title: "You have an unfinished workout",
    message: `${w.sessionName} from ${formatPlanDate(w.scheduledFor)} is still in progress. Resume it, or start today's workout and come back to it later.`,
    resume: `Resume ${w.sessionName}`,
    startAnyway: "Start today's anyway",
  };
}
