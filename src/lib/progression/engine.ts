/**
 * The pure reactive progression engine (spec §6, §11a).
 *
 * Deterministic: same performances in → same ReactiveState out. No randomness,
 * no DB, no React, no stored state. The read layer (src/lib/progression/
 * queries.ts) gathers performances and composes this; the engine itself never
 * touches Prisma.
 *
 * A "performance" is one completed LoggedExercise occurrence carrying its OWN
 * preserved plan context (repMin/repMax from the Pitch 4 snapshot), the
 * effective mesocycle week, and whether that week was a scheduled deload. For a
 * gym-variable exercise the caller passes only the selected gym's performances
 * (Resolved Decisions R12, R16, R42); for a gym-consistent exercise it passes
 * the global history (R11).
 */
import {
  MIN_QUALIFYING_SESSIONS,
  PROGRESS_CONSECUTIVE_SESSIONS,
  DELOAD_CONSECUTIVE_SESSIONS,
  STALL_WINDOW_SESSIONS,
} from "./config";
import { sessionE1rm } from "./e1rm";

export type WorkingSet = {
  setNumber: number;
  weightLbs: number;
  reps: number;
};

export type Performance = {
  loggedExerciseId: string;
  /** LoggedSession.scheduledFor — the occurrence's effective-week identity (R41). */
  dateIso: string;
  /** Effective mesocycle week of the occurrence. */
  week: number;
  /** True iff `week` is a scheduled-deload week; excluded from sequences (R38). */
  scheduledDeload: boolean;
  gymId: string | null;
  /** All planned working sets present (R9, R44). */
  complete: boolean;
  /** This performance's OWN planned rep range (R8). */
  repMin: number;
  repMax: number;
  workingSets: WorkingSet[];
};

export type ReactiveState =
  "insufficient" | "hold" | "progress" | "deload" | "stalled";

function byDate(a: Performance, b: Performance): number {
  if (a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? -1 : 1;
  // Stable tiebreak so "most recent" is deterministic for same-day occurrences.
  return a.loggedExerciseId < b.loggedExerciseId ? -1 : 1;
}

/**
 * The qualifying sequence: completed, NON-scheduled-deload performances, in
 * chronological order (R9, R24, R38, R43, R44). Scheduled-deload and incomplete
 * occurrences are excluded here, so "consecutive qualifying" skips them.
 */
export function qualifyingSequence(perfs: Performance[]): Performance[] {
  return perfs
    .filter((p) => p.complete && !p.scheduledDeload)
    .slice()
    .sort(byDate);
}

/** Every planned working set reached the top of this performance's range (R5). */
export function isAllTop(p: Performance): boolean {
  return (
    p.workingSets.length > 0 && p.workingSets.every((s) => s.reps >= p.repMax)
  );
}

/** At least one planned working set fell below this performance's minimum (R6). */
export function hasBelowMin(p: Performance): boolean {
  return p.workingSets.some((s) => s.reps < p.repMin);
}

/**
 * The reactive call over a scope's performances, following the precedence ladder
 * in spec §6: insufficient → reactive Deload → raw Progress (→ stall gate) →
 * Hold. Deload is evaluated before Progress, so in any defensive conflict Deload
 * wins and load is never increased on repeated below-range history (R7 precedence).
 *
 * Scheduled-deload SUPPRESSION of a specific occurrence (precedence step 1) is
 * the read layer's responsibility; here scheduled-deload performances are simply
 * excluded from the sequence.
 */
export function evaluateReactive(perfs: Performance[]): ReactiveState {
  const seq = qualifyingSequence(perfs);
  if (seq.length < MIN_QUALIFYING_SESSIONS) return "insufficient";

  // Reactive Deload first (safety precedence over Progress).
  const deloadWindow = seq.slice(-DELOAD_CONSECUTIVE_SESSIONS);
  if (
    deloadWindow.length === DELOAD_CONSECUTIVE_SESSIONS &&
    deloadWindow.every(hasBelowMin)
  ) {
    return "deload";
  }

  // Raw Progress candidate.
  const progressWindow = seq.slice(-PROGRESS_CONSECUTIVE_SESSIONS);
  const progressCandidate =
    progressWindow.length === PROGRESS_CONSECUTIVE_SESSIONS &&
    progressWindow.every(isAllTop);
  if (!progressCandidate) return "hold";

  // Stall gate only operates once a full window of qualifying points exists (R24).
  if (seq.length < STALL_WINDOW_SESSIONS) return "progress";

  const window = seq.slice(-STALL_WINDOW_SESSIONS);
  const start = sessionE1rm(window[0].workingSets);
  const end = sessionE1rm(window[window.length - 1].workingSets);
  // end > start → trend supports Progress; end <= start → withhold, flag stalled (R23).
  return end > start ? "progress" : "stalled";
}
