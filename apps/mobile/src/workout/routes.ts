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
