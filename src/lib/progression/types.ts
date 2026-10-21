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
