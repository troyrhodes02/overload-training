import type { OccurrenceProgressionDto } from "@overload/shared/contracts/progression";
import type {
  ProgressionTag,
  RecommendationDto,
} from "@overload/shared/progression/types";

/**
 * The card's call, as the screen shows it (Pitch 21g spec §5, §7). No I/O and
 * no training rule: every word and number below is a field the SERVER sent
 * (`recommendation.action`, `recommendation.evidence`, `tag`,
 * `insufficientNote`, `locked`). This module only decides which of them to
 * show, from the state of the read that brought them.
 */

export type InsightChip = {
  label: "Progress" | "Deload" | "Hold — trend flat";
  tone: "progress" | "deload";
};

export type InsightView =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "none" }
  | { kind: "locked" }
  | { kind: "insufficient"; note: string }
  | {
      kind: "call";
      chip: InsightChip | null;
      /** Progress, Deload, Reassess: the foreground voice. */
      strong: boolean;
      action: string;
      evidence: string;
      /** The call in a word, for VoiceOver (a hold has no chip, but a word). */
      spokenWord: string;
    };

/**
 * The chip for a tag, exactly the web's ProgressTag: Progress, Deload, and
 * "Hold — trend flat" for a stalled lift. A hold, not enough history, and a
 * deload week have no chip (a hold is a non-event, RD-4).
 */
export function chipFor(tag: ProgressionTag | null): InsightChip | null {
  if (tag === "progress") return { label: "Progress", tone: "progress" };
  if (tag === "deload") return { label: "Deload", tone: "deload" };
  if (tag === "stalled") return { label: "Hold — trend flat", tone: "deload" };
  return null;
}

/** The call in one word, read before the server's sentence. */
export function callWord(
  rec: Pick<RecommendationDto, "kind">,
  tag: ProgressionTag | null,
): string {
  if (tag === "stalled") return "Hold — trend flat";
  switch (rec.kind) {
    case "progress":
      return "Progress";
    case "hold":
      return "Hold";
    case "reassess":
      return "Reassess";
    case "deload":
      return "Deload";
    case "scheduled_deload":
      return "Deload week";
    default:
      // A kind a later server adds: its own words still show (never dropped).
      return "Call";
  }
}

/** The state of the insight read, as TanStack reports it. */
export type InsightReadState = {
  /** A fetch is in flight (first load, or a refetch after a change). */
  isFetching: boolean;
  /** The LATEST fetch failed. */
  isError: boolean;
  /**
   * A fetch is waiting for the connection (TanStack pauses reads while the
   * phone is offline instead of failing them). Optional for callers that
   * never pause.
   */
  isPaused?: boolean;
  /** An answer has arrived at least once. */
  hasData: boolean;
};

/**
 * What the card shows for one exercise. Order matters:
 *
 *  1. a fetch in flight → loading, so an older call is never shown as current
 *     while a newer one is on its way (after a correction, a gym change, an
 *     entitlement change, a return to the screen);
 *  2. the latest fetch failed, or is waiting for a connection → error, even
 *     when an older answer is cached (RD-6: a read that couldn't happen never
 *     shows a stale conclusion as current; a paused read resumes, and loads,
 *     on its own once the phone is back online);
 *  3. `locked` → the Pro note (the server withheld the call);
 *  4. a recommendation → the call;
 *  5. the server's not-enough-history line;
 *  6. nothing to say.
 */
export function insightFor(
  read: InsightReadState,
  call: OccurrenceProgressionDto | undefined,
): InsightView {
  if (read.isPaused) return { kind: "error" };
  if (read.isFetching) return { kind: "loading" };
  if (read.isError) return { kind: "error" };
  if (!read.hasData || !call) return { kind: "none" };
  if (call.locked !== null) return { kind: "locked" };
  const rec = call.recommendation;
  if (rec) {
    return {
      kind: "call",
      chip: chipFor(call.tag),
      strong: rec.tone === "strong",
      action: rec.action,
      evidence: rec.evidence,
      spokenWord: callWord(rec, call.tag),
    };
  }
  const note = call.insufficientNote ?? null;
  if (note) return { kind: "insufficient", note };
  return { kind: "none" };
}

/** The call for one card, out of the workout's gated `progression` list. */
export function callForCard(
  progression:
    | { loggedExerciseId: string; progression: OccurrenceProgressionDto }[]
    | undefined,
  loggedExerciseId: string,
): OccurrenceProgressionDto | undefined {
  return progression?.find((p) => p.loggedExerciseId === loggedExerciseId)
    ?.progression;
}

/** VoiceOver's label for a call: "Progress: Try 185 lb today (+5 lb)." */
export function callLabel(
  view: Extract<InsightView, { kind: "call" }>,
  expanded: boolean,
): string {
  const head = `${view.spokenWord}: ${view.action}.`;
  return expanded && view.evidence ? `${head} ${view.evidence}` : head;
}

/** The card's Pro note (the web's exercise-card sentence, without a link). */
export const CARD_PRO_NOTE =
  "Progress, hold, and deload calls for this lift are part of Pro.";

/** The summary's Pro note (the web's day-complete sentence, without a link). */
export const SUMMARY_PRO_NOTE =
  "What to do next time on each lift, and why, is part of Pro.";

export const CARD_INSIGHT_ERROR = "Couldn't load the call for this lift.";
