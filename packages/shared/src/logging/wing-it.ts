/**
 * Wing-It workouts (Pitch 25): a workout with no plan behind it. The words
 * and the pure rules both clients share, so the web and the iPhone say
 * exactly the same thing and apply the same limits as the server.
 *
 * Pure: no database, framework, or server dependency.
 */
import { LOGGED_REPS_MAX } from "./reps";
import { formatPreviousPerformance } from "./set-entry";

/** The one name for it, everywhere a workout name is shown. */
export const WING_IT_NAME = "Wing-It workout";

/** Most exercises one Wing-It workout may hold (input sanity; Bucket C, RD-29). */
export const WING_IT_MAX_EXERCISES = 30;

/**
 * The rep range sent in the OLD fields (`plannedRepRange`, `repRange`) of a
 * Wing-It row, only so an installed app that predates Wing-It keeps parsing
 * (spec §8, RD-28). It is the logged-reps limit, never a target: current
 * clients read `openEnded` and never show it.
 */
export const LEGACY_OPEN_REP_RANGE = { min: 1, max: LOGGED_REPS_MAX } as const;

export const WING_IT_COPY = {
  heading: WING_IT_NAME,
  start: "Start Wing-It workout",
  resume: "Resume Wing-It workout",
  /** Beside a scheduled, completed, or missed day. */
  helperPlanned:
    "Train something that isn't in your plan. Today's planned workout stays as it is.",
  /** On a rest day. */
  helperRest: "Not on today's plan? Log it as a Wing-It workout.",
  /** The no-plan card's line. */
  noPlan: "Build a plan for progress calls, or log a Wing-It workout now.",
  addExercise: "Add exercise",
  pickerTitle: "Add an exercise",
  allMuscles: "All muscle groups",
  inWorkout: "In this workout",
  emptyTitle: "No exercises yet.",
  emptyMessage: "Add the first one you're doing.",
  remove: "Remove from workout",
  noMatch: "No exercises match.",
  startFailed: "Couldn't start the workout. Nothing was changed.",
} as const;

/** "Finish Upper A first. It's still in progress with sets saved." */
export function wingItBlockedMessage(sessionName: string): string {
  return `Finish ${sessionName} first. It's still in progress with sets saved.`;
}

/** The Resume button the blocked notice offers. */
export function wingItBlockedResume(sessionName: string): string {
  return `Resume ${sessionName}`;
}

/**
 * The card's line where a planned card shows "3 × 8–12": what was logged,
 * never a target. "Logged as you go" before the first set.
 */
export function openEndedSchemeLine(setsLogged: number): string {
  if (setsLogged === 0) return "Logged as you go";
  return `${setsLogged} ${setsLogged === 1 ? "set" : "sets"} logged`;
}

/** The open workout's line on Today: "Harbor Barbell · 4 sets saved". */
export function wingItOpenLine(w: {
  gymName: string | null;
  setsLogged: number;
}): string {
  const sets =
    w.setsLogged === 0
      ? "No sets yet"
      : `${w.setsLogged} ${w.setsLogged === 1 ? "set" : "sets"} saved`;
  return w.gymName ? `${w.gymName} · ${sets}` : sets;
}

/** A finished workout's line: "✓ Wing-It workout · Harbor Barbell · 3 exercises · 9 sets". */
export function wingItFinishedLine(w: {
  gymName: string | null;
  exerciseCount: number;
  setsLogged: number;
}): string {
  return [
    `✓ ${WING_IT_NAME}`,
    w.gymName,
    `${w.exerciseCount} ${w.exerciseCount === 1 ? "exercise" : "exercises"}`,
    `${w.setsLogged} ${w.setsLogged === 1 ? "set" : "sets"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The open-ended set rule (the server's, so a client can pre-check): set
 * numbers run 1, 2, 3, … with no gaps, as many as the lifter does (no set
 * cap; owner decision at acceptance, superseding RD-29's 20). A number
 * already logged is a replay (the server decides identical or conflict).
 */
export function isAllowedOpenEndedSetNumber(
  setNumber: number,
  logged: readonly number[],
): boolean {
  if (!Number.isInteger(setNumber) || setNumber < 1) return false;
  const have = new Set(logged);
  if (have.has(setNumber)) return true;
  for (let n = 1; n < setNumber; n++) if (!have.has(n)) return false;
  return true;
}

/** Picker rows whose name contains the search text (the swap picker's filter). */
export function filterAddCandidates<T extends { name: string }>(
  candidates: readonly T[],
  search: string,
): T[] {
  const q = search.trim().toLowerCase();
  return q
    ? candidates.filter((c) => c.name.toLowerCase().includes(q))
    : [...candidates];
}

/**
 * An open-ended card's context line (RD-26): the most recent earlier
 * performance the server sent as reference, in the planned card's own
 * "Last time in … · date · sets" words — or the first-time line. Display
 * only: nothing is offered in the weight box, and no rep range is shown.
 */
export function formatOpenEndedContext(args: {
  reference: {
    dateIso: string;
    gymScoped: boolean;
    sets: readonly { weightLbs: number | null; reps: number }[];
    sessionName: string | null;
  } | null;
  isGymVariable: boolean;
  gymName: string | null;
  referenceIso: string;
}): string {
  return formatPreviousPerformance({
    previous: args.reference,
    isGymVariable: args.isGymVariable,
    gymName: args.gymName,
    referenceIso: args.referenceIso,
  });
}
