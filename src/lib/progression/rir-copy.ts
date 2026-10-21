/**
 * The one source of the RIR reason lines (RIR Logging & Autoregulation spec
 * §7, R20). Pure and client-safe. The figures are rendered from the engine's
 * constants, so the words always name the rule that was applied.
 */
import { RIR_AT_LIMIT, RIR_TO_SPARE_MIN } from "./config";
import type { RirEffect } from "./types";

/** The sentence under the call on the exercise card and the exercise page. */
export function rirReason(effect: RirEffect): string | null {
  if (effect === "held_at_limit") {
    return `Top of the range, but at your limit last time (${RIR_AT_LIMIT} RIR) — holding.`;
  }
  if (effect === "released_stall") {
    return `e1RM is flat, but every set last time had ${RIR_TO_SPARE_MIN}+ in reserve — ready to go up.`;
  }
  return null;
}

/** The short phrase under the exercise name in the day-complete summary. */
export function rirReasonShort(effect: RirEffect): string | null {
  if (effect === "held_at_limit") return "at your limit — holding";
  if (effect === "released_stall") return "reps to spare";
  return null;
}
