/** The workout screens live over the tabs, in the root `workout` stack (RD-6). */
export const workoutHref = (loggedSessionId: string) =>
  `/workout/${encodeURIComponent(loggedSessionId)}` as const;

export const summaryHref = (loggedSessionId: string) =>
  `/workout/${encodeURIComponent(loggedSessionId)}/summary` as const;

/** H2 lives in the History tab (RD-16). */
export const loggedWorkoutHref = (loggedSessionId: string) =>
  `/history/${encodeURIComponent(loggedSessionId)}` as const;
