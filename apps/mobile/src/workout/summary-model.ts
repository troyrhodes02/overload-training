import type { LoggedWorkoutDetailDto } from "@overload/shared/contracts/logging";
import type { SessionProgressionSummaryDto } from "@overload/shared/contracts/progression";
import { callView, type CallView } from "./insight-model";

/**
 * The full summary's rows (Pitch 21g design §6, spec §7; RD-10, RD-18). No
 * I/O and no training rule. The saved facts are the RECORD's, exactly what
 * History shows; the calls are the server's gated next-time calls, attached
 * to the record's exercises. Nothing here can add an exercise or a set that
 * isn't in the record.
 */

export type SummaryCall = CallView;

export type SummaryRow = {
  exercise: LoggedWorkoutDetailDto["exercises"][number];
  /** The server's next-time call for it, when there is one to show. */
  call: SummaryCall | null;
};

/**
 * Pair each recorded exercise with its call. The server's summary lists the
 * exercises that have a set, in the workout's order (the record's order too),
 * so they are matched in order AND by performed exercise: if the two ever
 * disagree, the exercise simply shows no call, never another lift's.
 */
export function summaryRows(
  detail: LoggedWorkoutDetailDto,
  summary: SessionProgressionSummaryDto | null | undefined,
): SummaryRow[] {
  const calls =
    summary && !summary.scheduledDeloadWeek ? summary.exercises : [];
  let next = 0;
  return detail.exercises.map((exercise) => {
    if (exercise.sets.length === 0) return { exercise, call: null };
    const c = calls[next];
    next += 1;
    if (!c || c.performedExerciseId !== exercise.exerciseId) {
      return { exercise, call: null };
    }
    const rec = c.recommendation;
    return {
      exercise,
      call: rec ? callView(rec, c.tag) : null,
    };
  });
}

/** One saved set as History lists it: "1  185 lbs × 8 · 2 RIR · extra". */
export function setLine(
  s: LoggedWorkoutDetailDto["exercises"][number]["sets"][number],
  value: string,
): string {
  return `${s.setNumber}  ${value}`;
}

/** The goals block's right-hand side: "82% → 85%", "85%", or "Goal reached". */
export function goalProgressLabel(row: {
  kind: "progress" | "reached";
  percentBefore: number | null;
  percentAfter: number | null;
}): string | null {
  if (row.kind === "reached") return "Goal reached";
  if (row.percentAfter == null) return null;
  return row.percentBefore != null && row.percentBefore !== row.percentAfter
    ? `${row.percentBefore}% → ${row.percentAfter}%`
    : `${row.percentAfter}%`;
}

export const SUMMARY_DELOAD_LINE = "Deload week — recovery, not a verdict.";
export const SUMMARY_CALLS_ERROR = "Couldn't load next-time calls.";
