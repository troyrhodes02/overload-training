/** The workout screens live over the tabs, in the root `workout` stack (RD-6). */
export const workoutHref = (loggedSessionId: string) =>
  `/workout/${encodeURIComponent(loggedSessionId)}` as const;

export const summaryHref = (loggedSessionId: string) =>
  `/workout/${encodeURIComponent(loggedSessionId)}/summary` as const;

/** H2 lives in the History tab (RD-16). */
export const loggedWorkoutHref = (loggedSessionId: string) =>
  `/history/${encodeURIComponent(loggedSessionId)}` as const;

/** X1 Swap exercise: a modal over the workout (Pitch 21f RD-13). */
export const swapHref = (loggedSessionId: string, loggedExerciseId: string) =>
  `/workout/${encodeURIComponent(loggedSessionId)}/swap?loggedExerciseId=${encodeURIComponent(loggedExerciseId)}` as const;

/**
 * E1 Edit set: a modal over the workout or over the logged workout (Pitch 21f
 * RD-13). `from` says which read already holds the set's stored values.
 */
export const editSetHref = (
  loggedSessionId: string,
  loggedSetId: string,
  from: "workout" | "history",
) =>
  `/workout/${encodeURIComponent(loggedSessionId)}/edit-set?loggedSetId=${encodeURIComponent(loggedSetId)}&from=${from}` as const;

/**
 * "About this exercise" (Pitch 21h RD-13): the exercise detail on the root
 * stack, over the workout, which stays mounted with everything typed.
 */
export function exerciseAboutHref(exerciseId: string): string {
  return `/exercise/${encodeURIComponent(exerciseId)}`;
}
