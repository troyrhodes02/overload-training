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
  RIR_AT_LIMIT,
  RIR_TO_SPARE_MIN,
} from "./config";
import { loadedSets, sessionE1rm } from "./e1rm";
import type { DecisionEvidence, PerformanceRef, RirEffect } from "./types";

export type { DecisionEvidence, PerformanceRef, RirEffect } from "./types";

export type WorkingSet = {
  setNumber: number;
  /** External load; null for a pure bodyweight (reps-only) set. */
  weightLbs: number | null;
  reps: number;
  /** Reported reps in reserve; null = not recorded (never treated as 0). */
  rir: number | null;
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

/**
 * The call plus how it was reached (RIR Logging & Autoregulation spec §11.5).
 * `base` is the weights-and-reps ladder's answer; `state` is the final call
 * after the RIR qualifiers; `rirEffect` names the qualifier that changed it.
 */
export type ReactiveDecision = {
  state: ReactiveState;
  base: ReactiveState;
  rirEffect: RirEffect;
  /**
   * The facts the deciding branch read (Smarter & Explainable Progression
   * spec §6, R3). Produced by the same branch that returned `state`, so the
   * two can never disagree. Derived on read, never stored.
   */
  evidence: DecisionEvidence;
  /**
   * The load of the last planned working set of the latest counted session
   * (null with no counted session, or for a bodyweight set). Read layers use
   * it only to check that the working weight they are about to print is the
   * one the judged session ended on (Smarter & Explainable Progression R33);
   * it is never a weight source of its own.
   */
  latestLoadLbs: number | null;
};

/**
 * Chronological order of performances, with a stable tiebreak so "most
 * recent" is deterministic for same-day occurrences. Exported so the read
 * layer's "latest finished" agrees with the engine's "latest counted".
 */
export function byDate(
  a: Pick<Performance, "dateIso" | "loggedExerciseId">,
  b: Pick<Performance, "dateIso" | "loggedExerciseId">,
): number {
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
 * Case A (R12): at least one planned working set was reported at the limit.
 * An unrecorded (null) RIR is never taken as 0.
 */
export function hasSetAtLimit(p: Performance): boolean {
  return p.workingSets.some((s) => s.rir !== null && s.rir <= RIR_AT_LIMIT);
}

/**
 * Case B (R13): EVERY planned working set was reported with reps to spare.
 * One unrecorded set fails it: a missing value is never assumed to look like
 * the recorded ones (R14).
 */
export function hasRepsToSpare(p: Performance): boolean {
  return (
    p.workingSets.length > 0 &&
    p.workingSets.every((s) => s.rir !== null && s.rir >= RIR_TO_SPARE_MIN)
  );
}

/**
 * The weights-and-reps call (the Progressive Overload Engine ladder, unchanged
 * by RIR Logging) over a scope's performances, following the precedence ladder
 * in spec §6: insufficient → reactive Deload → raw Progress (→ stall gate) →
 * Hold. Deload is evaluated before Progress, so in any defensive conflict Deload
 * wins and load is never increased on repeated below-range history (R7 precedence).
 *
 * Scheduled-deload SUPPRESSION of a specific occurrence (precedence step 1) is
 * the read layer's responsibility; here scheduled-deload performances are simply
 * excluded from the sequence.
 *
 * `e1rmApplicable: false` is the pure-bodyweight branch (requiresExternalWeight
 * false): the same rep-range rule decides insufficient / deload / progress /
 * hold, but there is no external load to estimate, so the e1RM stall gate is
 * skipped rather than fed a missing weight.
 *
 * Returns the state with the qualifying sequence it was computed from, the
 * evidence the deciding branch read (Smarter & Explainable Progression §6),
 * and — when the stall gate withheld — whether the trend was exactly flat or
 * falling (RIR Logging & Autoregulation R33: only a flat trend can be released).
 * The evidence is attached at each return; no condition or order changes.
 */
type BaseCall = {
  state: ReactiveState;
  seq: Performance[];
  stallTrend: "flat" | "falling" | null;
  evidence: DecisionEvidence;
};

function ref(p: Performance): PerformanceRef {
  return { loggedExerciseId: p.loggedExerciseId, dateIso: p.dateIso };
}

/** The value every performance in a window agrees on, else null (R14). */
function sharedValue(
  perfs: Performance[],
  pick: (p: Performance) => number,
): number | null {
  const first = pick(perfs[0]);
  return perfs.every((p) => pick(p) === first) ? first : null;
}

function evaluateBase(
  perfs: Performance[],
  { e1rmApplicable = true }: { e1rmApplicable?: boolean } = {},
): BaseCall {
  const seq = qualifyingSequence(perfs);
  const call = (
    state: ReactiveState,
    evidence: DecisionEvidence,
    stallTrend: BaseCall["stallTrend"] = null,
  ): BaseCall => ({ state, seq, stallTrend, evidence });
  if (seq.length < MIN_QUALIFYING_SESSIONS) {
    return call("insufficient", {
      kind: "insufficient",
      qualifying: seq.length,
      required: MIN_QUALIFYING_SESSIONS,
    });
  }

  // Reactive Deload first (safety precedence over Progress).
  const deloadWindow = seq.slice(-DELOAD_CONSECUTIVE_SESSIONS);
  if (
    deloadWindow.length === DELOAD_CONSECUTIVE_SESSIONS &&
    deloadWindow.every(hasBelowMin)
  ) {
    return call("deload", {
      kind: "deload",
      sessions: DELOAD_CONSECUTIVE_SESSIONS,
      repMin: sharedValue(deloadWindow, (p) => p.repMin),
    });
  }

  // Raw Progress candidate.
  const progressWindow = seq.slice(-PROGRESS_CONSECUTIVE_SESSIONS);
  const progressCandidate =
    progressWindow.length === PROGRESS_CONSECUTIVE_SESSIONS &&
    progressWindow.every(isAllTop);
  if (!progressCandidate) {
    // Hold: say what the latest counted session showed (spec §6).
    const latest = seq[seq.length - 1];
    if (isAllTop(latest)) {
      return call("hold", {
        kind: "hold_top_once",
        repMax: latest.repMax,
        sessions: PROGRESS_CONSECUTIVE_SESSIONS,
        latest: ref(latest),
      });
    }
    return call("hold", {
      kind: "hold_short",
      reps: latest.workingSets
        .slice()
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((s) => s.reps),
      repMin: latest.repMin,
      repMax: latest.repMax,
      latest: ref(latest),
    });
  }

  const progressEvidence: DecisionEvidence = {
    kind: "progress",
    sessions: PROGRESS_CONSECUTIVE_SESSIONS,
    repMax: sharedValue(progressWindow, (p) => p.repMax),
  };

  // No external load → no e1RM → no stall gate (bodyweight branch).
  if (!e1rmApplicable) return call("progress", progressEvidence);

  // Stall gate only operates once a full window of qualifying points exists (R24).
  if (seq.length < STALL_WINDOW_SESSIONS) {
    return call("progress", progressEvidence);
  }

  const window = seq.slice(-STALL_WINDOW_SESSIONS);
  const start = sessionE1rm(loadedSets(window[0].workingSets));
  const end = sessionE1rm(loadedSets(window[window.length - 1].workingSets));
  // end > start → trend supports Progress; end <= start → withhold, flag stalled (R23).
  if (end > start) return call("progress", progressEvidence);
  return call(
    "stalled",
    {
      kind: "stalled",
      sessions: PROGRESS_CONSECUTIVE_SESSIONS,
      window: STALL_WINDOW_SESSIONS,
      repMax: progressEvidence.repMax,
    },
    end === start ? "flat" : "falling",
  );
}

/**
 * The reactive call with RIR as one more signal (RIR Logging & Autoregulation
 * spec §6, §11.5). The weights-and-reps ladder above runs first and unchanged;
 * then reported RIR from the planned working sets of the MOST RECENT qualifying
 * performance may qualify it in exactly two ways:
 *
 *   A. base `progress` + any working set at RIR <= RIR_AT_LIMIT → `hold`
 *      (`held_at_limit`): the top of the range was reached only at failure.
 *   B. base `stalled` with an exactly FLAT e1RM window + every working set at
 *      RIR >= RIR_TO_SPARE_MIN → `progress` (`released_stall`): the flat trend
 *      is the load repeated, not a plateau. A falling trend is never released
 *      (R33): the lifter did less than before, and RIR can't argue with that.
 *
 * Every other base call — insufficient, reactive Deload, ordinary hold — is
 * returned as is: RIR never creates or cancels a Deload and never stands in for
 * reps not done (R15). A history with no RIR yields exactly the base call. A and
 * B can never meet (no 0 among all-2+ sets), so the order is immaterial.
 */
export function evaluateReactiveDecision(
  perfs: Performance[],
  opts: { e1rmApplicable?: boolean } = {},
): ReactiveDecision {
  const { state: base, seq, stallTrend, evidence } = evaluateBase(perfs, opts);
  const latest = seq.at(-1);
  const lastSet = latest?.workingSets.reduce<WorkingSet | null>(
    (last, s) => (!last || s.setNumber > last.setNumber ? s : last),
    null,
  );
  const latestLoadLbs = lastSet?.weightLbs ?? null;
  if (
    latest &&
    base === "stalled" &&
    stallTrend === "flat" &&
    hasRepsToSpare(latest)
  ) {
    return {
      state: "progress",
      base,
      rirEffect: "released_stall",
      evidence: {
        kind: "released_stall",
        rirToSpare: RIR_TO_SPARE_MIN,
        latest: ref(latest),
      },
      latestLoadLbs,
    };
  }
  if (latest && base === "progress" && hasSetAtLimit(latest)) {
    return {
      state: "hold",
      base,
      rirEffect: "held_at_limit",
      evidence: {
        kind: "held_at_limit",
        rirAtLimit: RIR_AT_LIMIT,
        latest: ref(latest),
      },
      latestLoadLbs,
    };
  }
  return { state: base, base, rirEffect: null, evidence, latestLoadLbs };
}

/** The final call only (kept for callers that need just the state, R29). */
export function evaluateReactive(
  perfs: Performance[],
  opts: { e1rmApplicable?: boolean } = {},
): ReactiveState {
  return evaluateReactiveDecision(perfs, opts).state;
}
