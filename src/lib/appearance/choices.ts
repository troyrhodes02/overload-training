import type { Appearance } from "./appearance";

/**
 * Ordering for appearance saves (spec R7, review of #62). The Settings island
 * applies a choice at once and saves it in the background; taps can overlap.
 *
 * - The last choice wins: only the latest tap's outcome may change the screen.
 * - `confirmed` is the newest value the server accepted, in tap order (Next
 *   runs a client's server actions one at a time, so that is also the order
 *   they were stored). A failed latest save reverts the screen to it — the
 *   value the account actually holds — even if an earlier tap's success
 *   arrived while a newer tap was still in flight.
 * - While any save is in flight the shell must not re-apply the layout's
 *   value: an earlier save's refresh() would otherwise flip the app back to a
 *   superseded choice (see AppearanceSync).
 */
export function createChoiceTracker(initial: Appearance) {
  let latest = 0;
  let confirmed = initial;
  let confirmedSeq = 0;

  return {
    /** Starts a save for a tap; returns its sequence number. */
    begin(): number {
      inFlight += 1;
      return ++latest;
    },
    /**
     * Records a save's outcome. `revertTo` is set only when this was the
     * latest tap and it failed: the screen must go back to that value.
     */
    settle(
      seq: number,
      value: Appearance,
      ok: boolean,
    ): { isLatest: boolean; revertTo: Appearance | null } {
      inFlight = Math.max(0, inFlight - 1);
      if (ok && seq > confirmedSeq) {
        confirmed = value;
        confirmedSeq = seq;
      }
      const isLatest = seq === latest;
      return { isLatest, revertTo: isLatest && !ok ? confirmed : null };
    },
    get confirmed(): Appearance {
      return confirmed;
    },
  };
}

// Saves in flight across the whole page (module scope: one Settings island
// at a time, read by the shell's AppearanceSync).
let inFlight = 0;

/** True while any appearance save started from Settings is unanswered. */
export function appearanceSaveInFlight(): boolean {
  return inFlight > 0;
}
