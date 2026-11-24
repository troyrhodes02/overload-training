import type {
  ExerciseHistoryDto,
  ExerciseHistoryViewDto,
  HistoryNextDto,
  SessionCallKind,
  SessionRowDto,
  TrendDto,
} from "@overload/shared/contracts/exercise-history";
import {
  formatRirLine,
  formatSetLine,
} from "@overload/shared/progression/history-format";
import { chipFor, type InsightChip } from "../workout/insight-model";

/**
 * Exercise history's pure presentation (Pitch 21i design X2). The answer is
 * the web page's gated read: every set, record, trend point, and call is the
 * server's. This module only decides what to show and prints logged values
 * with the shared formatters. It never estimates, compares, or fills a gap.
 */

/** Which stack a history screen lives in (RD-12): its links stay there. */
export type HistoryStack = "goals" | "plan" | "more" | "root";

const BASE: Record<Exclude<HistoryStack, "root">, string> = {
  goals: "/goals",
  plan: "/plan",
  more: "/more",
};

/** X2 in a stack (root: over the workout). */
export function exerciseHistoryHref(
  stack: HistoryStack,
  exerciseId: string,
  scope: string | null = null,
): string {
  const base =
    stack === "root"
      ? `/exercise-history/${encodeURIComponent(exerciseId)}`
      : `${BASE[stack]}/exercise-history/${encodeURIComponent(exerciseId)}`;
  return scope ? `${base}?scope=${encodeURIComponent(scope)}` : base;
}

/** H2 in the same stack, or null over a workout (RD-12: no second editor). */
export function loggedWorkoutHrefIn(
  stack: HistoryStack,
  loggedSessionId: string,
): string | null {
  if (stack === "root") return null;
  return `${BASE[stack]}/logged/${encodeURIComponent(loggedSessionId)}`;
}

/** X1 in the same stack. */
export function exerciseDetailHrefIn(
  stack: HistoryStack,
  exerciseId: string,
): string {
  const id = encodeURIComponent(exerciseId);
  switch (stack) {
    case "goals":
      return `/goals/exercise/${id}`;
    case "plan":
      return `/plan/exercise/${id}`;
    case "more":
      return `/more/exercises/${id}`;
    default:
      return `/exercise/${id}`;
  }
}

/** The muted words for every call that isn't one of the engine's tags (the web's). */
const MUTED_CALL: Partial<Record<SessionCallKind, string>> = {
  hold: "Hold",
  insufficient: "Not enough history",
  deload_week: "Deload week",
  not_counted: "Not counted",
  in_progress: "In progress",
};

export type SessionCall =
  { kind: "chip"; chip: InsightChip } | { kind: "word"; word: string } | null;

/** A session's call on the right (Pro; "none" on Free shows nothing). */
export function sessionCall(call: SessionCallKind): SessionCall {
  if (call === "progress" || call === "deload" || call === "stalled") {
    const chip = chipFor(call);
    return chip ? { kind: "chip", chip } : null;
  }
  const word = MUTED_CALL[call];
  return word ? { kind: "word", word } : null;
}

export type SessionLines = {
  head: string;
  sets: string;
  rir: string | null;
  notCounted: string | null;
  swap: string | null;
  label: string;
};

/** One session's lines, exactly as logged (the web's list). */
export function sessionLines(
  row: SessionRowDto,
  externalLoad: boolean,
): SessionLines {
  const head = [
    row.dateLabel,
    row.sessionName,
    row.gymName
      ? `${row.gymName}${row.gymArchived ? " (archived)" : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const sets = formatSetLine(row, externalLoad);
  const rir = formatRirLine(row.workingSets);
  const notCounted =
    row.call === "not_counted"
      ? `${row.workingSets.length} of ${row.plannedSets} planned sets`
      : null;
  const swap = row.swappedFromName
    ? `In place of ${row.swappedFromName}`
    : null;
  const call = sessionCall(row.call);
  const callWords =
    call?.kind === "chip"
      ? call.chip.label
      : call?.kind === "word"
        ? call.word
        : null;
  const label = [head, sets, rir, notCounted, swap, callWords]
    .filter(Boolean)
    .join(", ");
  return { head, sets, rir, notCounted, swap, label };
}

/** The one chart's series (RD-6): e1RM for a loaded lift, reps otherwise. */
export type TrendView =
  | {
      kind: "series";
      series: "e1rm" | "reps";
      trend: TrendDto;
      unit: "lb" | "reps";
      title: string;
      latestLabel: string;
    }
  /** Free: the server withheld the e1RM trend. */
  | { kind: "locked" }
  | null;

export function trendViewOf(h: ExerciseHistoryDto): TrendView {
  if (!h.hasHistory || !h.selectedScope) return null;
  if (h.externalLoad) {
    if (!h.trend.e1rm) return { kind: "locked" };
    return {
      kind: "series",
      series: "e1rm",
      trend: h.trend.e1rm,
      unit: "lb",
      title: "e1RM",
      latestLabel: "Current",
    };
  }
  if (!h.trend.reps) return null;
  return {
    kind: "series",
    series: "reps",
    trend: h.trend.reps,
    unit: "reps",
    title: "Most reps",
    latestLabel: "Last",
  };
}

/** The footnote under the chart (the web's words). */
export function trendFootnote(
  view: Extract<TrendView, { kind: "series" }>,
  scopeName: string | null,
  noGymScope: boolean,
): string {
  const n = view.trend.points.length;
  const sessions = `${n} session${n === 1 ? "" : "s"}`;
  const at = noGymScope
    ? " with no gym recorded"
    : scopeName
      ? ` at ${scopeName}`
      : "";
  const what =
    view.series === "e1rm" ? "Epley estimate" : "most reps in a working set";
  const deload = view.trend.points.some((p) => p.scheduledDeload)
    ? " · □ deload week"
    : "";
  return `${sessions}${at} · ${what}${deload}`;
}

/** Fewer than two points is a sentence, never a chart (the web's R15). */
export function trendSentence(
  view: Extract<TrendView, { kind: "series" }>,
): string | null {
  const pts = view.trend.points;
  if (pts.length === 0) return "No finished workouts yet.";
  if (pts.length === 1) {
    const v = pts[0].value;
    const single = view.series === "e1rm" ? `e1RM ${v} lb` : `${v} reps`;
    return `One session so far: ${single}. The trend starts at two.`;
  }
  return null;
}

/** "Next time" lines: one per recurring workout when there are two or more. */
export type NextLine =
  | {
      kind: "call";
      label: string | null;
      next: Extract<HistoryNextDto, { kind: "call" }>;
    }
  | { kind: "no_gym"; label: string | null };

export function nextLines(h: ExerciseHistoryDto): NextLine[] {
  const usable = (n: HistoryNextDto | null) =>
    n !== null &&
    (n.kind === "no_gym" ||
      n.tag !== null ||
      n.recommendation !== null ||
      n.insufficientNote !== null);
  if (h.nextByWorkout.length > 1) {
    return h.nextByWorkout
      .filter((w) => usable(w.next))
      .map((w) => {
        const label = `${w.sessionName} · ${w.repRange.min === w.repRange.max ? w.repRange.min : `${w.repRange.min}–${w.repRange.max}`} reps`;
        return w.next.kind === "no_gym"
          ? { kind: "no_gym" as const, label }
          : { kind: "call" as const, label, next: w.next };
      });
  }
  const n = h.next;
  if (!usable(n) || !n) return [];
  return n.kind === "no_gym"
    ? [{ kind: "no_gym", label: null }]
    : [{ kind: "call", label: null, next: n }];
}

/** The scope chips for a machine (gym ids, "none" for legacy rows). */
export function scopeOptions(
  h: ExerciseHistoryDto,
): { value: string; label: string }[] {
  return h.scopes.map((s) => ({ value: s.key, label: s.label }));
}

/** The machine's selected gym name, for section headings; null otherwise. */
export function scopeName(h: ExerciseHistoryDto): string | null {
  return h.gymVariable && h.selectedScope ? h.selectedScope.label : null;
}

/** Whether the selected machine scope is the legacy "No gym recorded" rows. */
export function isNoGymScope(h: ExerciseHistoryDto): boolean {
  return h.gymVariable && h.selectedScope?.key === "none";
}

/** Everything X2 shows, from one answer. */
export function historySections(view: ExerciseHistoryViewDto) {
  const h = view.history;
  return {
    empty: !h.hasHistory,
    next: nextLines(h),
    locked: h.locked !== null,
    records: h.records,
    trend: trendViewOf(h),
    sessions: h.sessions,
    goals: view.goals,
  };
}
