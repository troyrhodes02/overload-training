/**
 * The engine check (Pitch 21g spec §11, RD-15): compare what the UNCHANGED,
 * gated server reader said about a lift with what a profile promises. Pure:
 * the caller reads the call (the card reader in the integration test, Today's
 * planned list in the command) and passes it in. A fixture name is not proof
 * of its state; this is.
 */
import type { CallExpectation } from "./profiles";

/** The fields of a gated call that decide what a lifter sees. */
export type ObservedCall = {
  tag: "progress" | "deload" | "stalled" | null;
  rirEffect: "held_at_limit" | "released_stall" | null;
  suggestion: {
    lbs: number;
    kind: "progress_increment" | "scheduled_deload";
  } | null;
  recommendation: { kind: string; action: string } | null;
  locked: string | null;
};

/** The card's state, from the server's fields only (as the phone reads them). */
export function observedState(
  c: ObservedCall,
): CallExpectation["call"] | "none" {
  if (c.locked !== null) return "locked";
  if (c.suggestion?.kind === "scheduled_deload") return "deload_week";
  const rec = c.recommendation;
  if (!rec) return c.tag === null ? "insufficient" : "none";
  if (rec.kind === "scheduled_deload") return "deload_week";
  if (c.tag === "stalled") return "stalled";
  if (
    rec.kind === "progress" ||
    rec.kind === "deload" ||
    rec.kind === "reassess"
  )
    return rec.kind;
  if (rec.kind === "hold") return "hold";
  return "none";
}

/**
 * Null when the call matches the expectation, else a one-line difference.
 * `checkAction` is false where the reader has no sentence for that state
 * (Today's planned list in a deload week carries the load, not the line).
 */
export function compareCall(
  want: CallExpectation,
  got: ObservedCall,
  opts: { checkAction?: boolean } = {},
): string | null {
  const state = observedState(got);
  if (state !== want.call) return `expected ${want.call}, engine says ${state}`;
  if (want.rirEffect && got.rirEffect !== want.rirEffect)
    return `expected RIR effect ${want.rirEffect}, engine says ${got.rirEffect ?? "none"}`;
  if (
    opts.checkAction !== false &&
    want.action &&
    got.recommendation?.action !== want.action
  )
    return `expected "${want.action}", engine says "${got.recommendation?.action ?? "(no sentence)"}"`;
  return null;
}

/** How a call reads in the command's output. */
export function describeCall(c: ObservedCall): string {
  const state = observedState(c);
  if (state === "locked") return "locked (Pro note)";
  if (state === "insufficient") return "not enough history (no call)";
  if (state === "deload_week")
    return (
      c.recommendation?.action ??
      (c.suggestion ? `deload week (${c.suggestion.lbs} lb)` : "deload week")
    );
  if (state === "none") return "no call";
  const rir = c.rirEffect ? ` [RIR: ${c.rirEffect}]` : "";
  return `${state}: ${c.recommendation?.action ?? ""}${rir}`;
}
