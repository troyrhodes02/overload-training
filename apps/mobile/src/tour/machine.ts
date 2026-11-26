import type { Rect, TourTarget } from "./types";

/**
 * The native tour's state machine (Pitch 21k spec §5.1). Pure: no React, no
 * timers, no I/O. The provider feeds it events and runs the effects it
 * returns. Every event that doesn't apply to the current state is a no-op,
 * which is what makes a second tap on Next or Skip harmless, and every
 * measurement carries the token of the locate that asked for it, so a late
 * answer for an earlier step is dropped.
 */

export type TourMode = "manual" | "auto";
export type TourOutcome = "completed" | "skipped";
export type TourInterruption = "background" | "foreign_navigation" | "unmount";

export type TourState =
  | { readonly phase: "idle"; readonly token: number }
  | { readonly phase: "intro"; readonly mode: TourMode; readonly token: number }
  | {
      readonly phase: "locating";
      readonly mode: TourMode;
      readonly index: number;
      readonly token: number;
    }
  | {
      readonly phase: "showing";
      readonly mode: TourMode;
      readonly index: number;
      readonly token: number;
      /** The measured target, or null: explain in words (fallback / note). */
      readonly rect: Rect | null;
      readonly target: TourTarget | null;
      /** The pathname when the step appeared; a change is foreign. */
      readonly expectedPath: string;
    };

export type TourEvent =
  | { readonly type: "START"; readonly mode: TourMode }
  | { readonly type: "BEGIN" }
  | { readonly type: "CANCEL" }
  | {
      readonly type: "FOUND";
      readonly token: number;
      readonly rect: Rect;
      readonly target: TourTarget;
      readonly path: string;
    }
  | { readonly type: "MISSING"; readonly token: number; readonly path: string }
  /**
   * The shown target moved (a refresh pushed the content, a list loaded) or
   * can no longer be measured (null: explain the step in words instead).
   */
  | {
      readonly type: "MOVED";
      readonly token: number;
      readonly rect: Rect | null;
    }
  | { readonly type: "NEXT" }
  | { readonly type: "BACK" }
  | { readonly type: "SKIP" }
  | { readonly type: "INTERRUPT"; readonly reason: TourInterruption };

export type TourEffect =
  /** Write the run's outcome (PUT /me/tour/outcome). */
  | { readonly kind: "record"; readonly outcome: TourOutcome }
  /** Spend the automatic offer (POST /me/tour/offered). */
  | { readonly kind: "offered" }
  /** Go back to the More tab, where a manual tour starts and ends. */
  | { readonly kind: "return" };

export type Transition = {
  readonly state: TourState;
  readonly effects: readonly TourEffect[];
};

export const INITIAL_TOUR_STATE: TourState = { phase: "idle", token: 0 };

const same = (state: TourState): Transition => ({ state, effects: [] });

function close(state: TourState, effects: TourEffect[]): Transition {
  return { state: { phase: "idle", token: state.token + 1 }, effects };
}

/**
 * The next state for `event`, given `stepCount` steps (at least 1), and the
 * effects to run. Never throws.
 */
export function transition(
  state: TourState,
  event: TourEvent,
  stepCount: number,
): Transition {
  switch (event.type) {
    case "START":
      if (state.phase !== "idle" || stepCount < 1) return same(state);
      return {
        state: { phase: "intro", mode: event.mode, token: state.token + 1 },
        // An automatic run spends its one offer the moment it appears, so
        // abandoning it never brings it back (Onboarding Tour R8).
        effects: event.mode === "auto" ? [{ kind: "offered" }] : [],
      };

    case "BEGIN":
      if (state.phase !== "intro") return same(state);
      return {
        state: {
          phase: "locating",
          mode: state.mode,
          index: 0,
          token: state.token + 1,
        },
        effects: [],
      };

    case "CANCEL":
      if (state.phase !== "intro") return same(state);
      // "Not now": a manual launch backed out of records nothing; an
      // automatic one was declined (RD-9).
      return close(
        state,
        state.mode === "auto" ? [{ kind: "record", outcome: "skipped" }] : [],
      );

    case "FOUND":
    case "MISSING":
      if (state.phase !== "locating" || event.token !== state.token) {
        return same(state);
      }
      return {
        state: {
          phase: "showing",
          mode: state.mode,
          index: state.index,
          token: state.token,
          rect: event.type === "FOUND" ? event.rect : null,
          target: event.type === "FOUND" ? event.target : null,
          expectedPath: event.path,
        },
        effects: [],
      };

    case "MOVED":
      if (
        state.phase !== "showing" ||
        event.token !== state.token ||
        state.rect === null
      ) {
        return same(state);
      }
      return {
        state: event.rect
          ? { ...state, rect: event.rect }
          : { ...state, rect: null, target: null },
        effects: [],
      };

    case "NEXT":
      if (state.phase !== "showing") return same(state);
      if (state.index + 1 >= stepCount) {
        return close(state, [
          { kind: "record", outcome: "completed" },
          { kind: "return" },
        ]);
      }
      return {
        state: {
          phase: "locating",
          mode: state.mode,
          index: state.index + 1,
          token: state.token + 1,
        },
        effects: [],
      };

    case "BACK":
      if (state.phase !== "showing" || state.index === 0) return same(state);
      return {
        state: {
          phase: "locating",
          mode: state.mode,
          index: state.index - 1,
          token: state.token + 1,
        },
        effects: [],
      };

    case "SKIP":
      if (state.phase !== "showing" && state.phase !== "locating") {
        return same(state);
      }
      return close(state, [
        { kind: "record", outcome: "skipped" },
        { kind: "return" },
      ]);

    case "INTERRUPT":
      if (state.phase === "idle") return same(state);
      // A navigation the tour didn't make reads as a skip, as on the web
      // (Onboarding Tour R7). Backgrounding and unmounting record nothing
      // (the web's reload or closed tab), RD-10.
      return close(
        state,
        event.reason === "foreign_navigation"
          ? [{ kind: "record", outcome: "skipped" }]
          : [],
      );
  }
}

/** "Step n of N": every native step counts, shown in words or highlighted. */
export function stepCounter(
  index: number,
  stepCount: number,
): { position: number; total: number } {
  return { position: index + 1, total: stepCount };
}
