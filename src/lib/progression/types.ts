/**
 * Client-safe progression UI types (spec §13). Declared in a pure module so
 * client islands (the exercise card, chart, gym selector) and the shared
 * ProgressTag can import them without pulling in the server-only read layer.
 */

/** A visible tag. Hold / insufficient / scheduled-deload suppression render nothing. */
export type ProgressionTag = "progress" | "deload" | "stalled";

/**
 * Which RIR qualifier changed the weights-and-reps call, if any (RIR Logging &
 * Autoregulation spec §6, R19). Derived on read, never stored.
 * `held_at_limit`: a Progress held because a working set was at 0 RIR.
 * `released_stall`: a flat-trend hold released because every set had 2+.
 */
export type RirEffect = "held_at_limit" | "released_stall" | null;

/** The occurrence a piece of evidence refers to (its date names it in copy). */
export type PerformanceRef = { loggedExerciseId: string; dateIso: string };

/**
 * The facts the engine branch that decided the call actually read (Smarter &
 * Explainable Progression spec §6, §11.1). One kind per branch, so the call
 * and its evidence can never disagree. `repMin`/`repMax` are null when the
 * sessions in a window had different planned ranges (R14). Derived on read,
 * never stored; it never crosses to the client (the strings do).
 */
export type DecisionEvidence =
  | { kind: "insufficient"; qualifying: number; required: number }
  | { kind: "deload"; sessions: number; repMin: number | null }
  | { kind: "progress"; sessions: number; repMax: number | null }
  | {
      kind: "stalled";
      sessions: number;
      window: number;
      repMax: number | null;
    }
  | {
      kind: "hold_top_once";
      repMax: number;
      sessions: number;
      latest: PerformanceRef;
    }
  | {
      kind: "hold_short";
      reps: number[];
      repMin: number;
      repMax: number;
      latest: PerformanceRef;
    }
  | { kind: "held_at_limit"; rirAtLimit: number; latest: PerformanceRef }
  | { kind: "released_stall"; rirToSpare: number; latest: PerformanceRef };

/**
 * A recommendation: what to do, and the evidence for it (spec §11.2, §13).
 * Built by `buildRecommendation` on every read; never stored.
 */
export type RecommendationDto = {
  kind: "progress" | "hold" | "deload" | "scheduled_deload";
  /** strong = Progress / Deload (foreground); quiet = holds and the deload week. */
  tone: "strong" | "quiet";
  action: string;
  evidence: string;
};

/** Display-only suggested load. `+5` for a Progress call, `90%` for scheduled deload. */
export type SuggestedLoadDto = {
  lbs: number;
  kind: "progress_increment" | "scheduled_deload";
} | null;

/** One e1RM chart point — one per completed performance (R49). Client-safe. */
export type E1rmPointDto = {
  dateIso: string;
  dateLabel: string;
  e1rm: number;
  /** Scheduled-deload performance: marked on the chart, excluded from calls (R39). */
  scheduledDeload: boolean;
  gymName: string | null;
};
