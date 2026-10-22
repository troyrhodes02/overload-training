/**
 * Exercise History & PR Intelligence — the pure projections of one scope of
 * an exercise's history (spec §4, §6, §11.3; Resolved Decisions R7–R15,
 * R21, R22). Records, the call each session led to, and the trend points are
 * all derived here, on every read, from the same rows the progression engine
 * judges; nothing is stored, so a corrected set changes every value on the
 * next read.
 *
 * Pure and client-safe: no Prisma, React, or server-only import. It defines
 * no e1RM formula, ordering, or threshold of its own — it reuses
 * `estimateOneRepMax` / `bestWorkingSet` / `sessionE1rm` (e1rm.ts) and the
 * engine's `evaluateReactiveDecision` / `byDate` (engine.ts).
 *
 * Callers pass the rows of ONE scope only (every gym for a gym-consistent
 * exercise, one gym for a machine or cable): nothing here can combine two
 * gyms' rows unless a caller hands them over, and the read layer never does.
 */
import {
  byDate,
  evaluateReactiveDecision,
  type Performance,
  type WorkingSet,
} from "./engine";
import {
  bestWorkingSet,
  estimateOneRepMax,
  loadedSets,
  sessionE1rm,
} from "./e1rm";

/** Rows shown in Sessions before "View all" (R16). Display constant, Bucket C. */
export const RECENT_SESSIONS = 10;

/** Rep records listed, heaviest first (R10). Display constant, Bucket C. */
export const REP_RECORDS_MAX = 6;

/** One performance of the scope, as the history page needs it. */
export type HistoryRow = {
  /** The engine-facing performance (its working sets, plan range, week). */
  perf: Performance;
  /** The workout was finished (complete), whether or not every set was logged. */
  finished: boolean;
  /** Sets beyond the plan: shown in Sessions, never a record or a point. */
  extraSets: WorkingSet[];
};

/** A working set that may hold a record, with when it was lifted. */
export type RecordSet = {
  weightLbs: number | null;
  reps: number;
  dateIso: string;
  loggedExerciseId: string;
  setNumber: number;
};
export type LoadedRecordSet = RecordSet & { weightLbs: number };

export type ExerciseRecords =
  | {
      kind: "loaded";
      bestSet: LoadedRecordSet;
      /** Precise estimate of the best set (callers round for display). */
      bestE1rm: number;
      heaviest: LoadedRecordSet;
      repRecords: LoadedRecordSet[];
    }
  | { kind: "bodyweight"; mostReps: RecordSet };

export type SessionCallKind =
  | "progress"
  | "deload"
  | "stalled"
  | "hold"
  | "insufficient"
  | "deload_week"
  | "not_counted"
  | "in_progress"
  | "none";

export type TrendPoint = {
  loggedExerciseId: string;
  dateIso: string;
  value: number;
  scheduledDeload: boolean;
  workingSets: WorkingSet[];
};

/** Chronological (the engine's order), so "earliest" ties are well defined. */
function chronological<T extends { perf: Performance }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => byDate(a.perf, b.perf));
}

const bySetNumber = (a: WorkingSet, b: WorkingSet) => a.setNumber - b.setNumber;

/**
 * The sets that can hold a record (R7, R21, R22): the planned working sets of
 * FINISHED workouts outside scheduled-deload weeks — the same population Goals
 * measures ("demonstrated strength"), so the page's best and a goal's best
 * are always the same set. Chronological, then by set number.
 */
export function recordPopulation(rows: HistoryRow[]): RecordSet[] {
  return chronological(
    rows.filter((r) => r.finished && !r.perf.scheduledDeload),
  ).flatMap((r) =>
    r.perf.workingSets
      .slice()
      .sort(bySetNumber)
      .map((s) => ({
        weightLbs: s.weightLbs,
        reps: s.reps,
        dateIso: r.perf.dateIso,
        loggedExerciseId: r.perf.loggedExerciseId,
        setNumber: s.setNumber,
      })),
  );
}

/**
 * The rep-max frontier (R10): for each load, heaviest first, the most reps
 * done at that load — listed only when it beats the best reps at every
 * heavier load. A lighter set therefore appears only for doing MORE reps
 * than anything heavier, never "above" it, and no two loads are scored
 * against each other. Each entry is the earliest set reaching it. `sets`
 * must be chronological (as recordPopulation returns them).
 */
export function repRecordFrontier(
  sets: LoadedRecordSet[],
  max: number = REP_RECORDS_MAX,
): LoadedRecordSet[] {
  const topAtLoad = new Map<number, LoadedRecordSet>();
  for (const s of sets) {
    const top = topAtLoad.get(s.weightLbs);
    if (!top || s.reps > top.reps) topAtLoad.set(s.weightLbs, s);
  }
  const out: LoadedRecordSet[] = [];
  let bestHeavier = 0;
  for (const load of [...topAtLoad.keys()].sort((a, b) => b - a)) {
    const top = topAtLoad.get(load) as LoadedRecordSet;
    if (top.reps > bestHeavier) {
      out.push(top);
      bestHeavier = top.reps;
    }
  }
  return out.slice(0, max);
}

/**
 * The records of one scope (spec §4), or null when no set can hold one.
 * Loaded: Best set = `bestWorkingSet` (highest e1RM, earliest tie — the same
 * "best set" every session e1RM and every goal uses, R8); Best e1RM = its
 * estimate; Heaviest = greatest load, then most reps, then earliest (R9);
 * Rep records = the frontier (R10). Bodyweight: most reps in one set (R11).
 */
export function computeRecords(
  rows: HistoryRow[],
  externalLoad: boolean,
): ExerciseRecords | null {
  const population = recordPopulation(rows);
  if (!externalLoad) {
    let most: RecordSet | null = null;
    for (const s of population) if (!most || s.reps > most.reps) most = s;
    return most ? { kind: "bodyweight", mostReps: most } : null;
  }
  const loaded = loadedSets(population);
  const bestSet = bestWorkingSet(loaded);
  if (!bestSet) return null;
  let heaviest = loaded[0];
  for (const s of loaded) {
    if (
      s.weightLbs > heaviest.weightLbs ||
      (s.weightLbs === heaviest.weightLbs && s.reps > heaviest.reps)
    ) {
      heaviest = s;
    }
  }
  return {
    kind: "loaded",
    bestSet,
    bestE1rm: estimateOneRepMax(bestSet.weightLbs, bestSet.reps),
    heaviest,
    repRecords: repRecordFrontier(loaded),
  };
}

/**
 * The call each session led to (spec §6, R12): for a counted session, the
 * engine's call on the scope's history up to and including it — the same
 * function, rules, and order as the current call, run on the sets as they are
 * now. Sessions the engine doesn't count say why instead; a scheduled-deload
 * week is never evaluated (suppression). With `noGymScope` (machine rows with
 * no gym) there are no calls at all: machine calls are made per gym (R6).
 *
 * The newest counted session's call is, by construction, the engine's call on
 * the whole scope — the current call.
 */
export function callsBySession(
  rows: HistoryRow[],
  opts: { externalLoad: boolean; noGymScope: boolean },
): Map<string, SessionCallKind> {
  const ordered = chronological(rows);
  const calls = new Map<string, SessionCallKind>();
  ordered.forEach((r, i) => {
    const id = r.perf.loggedExerciseId;
    if (opts.noGymScope) return calls.set(id, "none");
    if (!r.finished) return calls.set(id, "in_progress");
    if (r.perf.scheduledDeload) return calls.set(id, "deload_week");
    if (!r.perf.complete) return calls.set(id, "not_counted");
    const { state } = evaluateReactiveDecision(
      ordered.slice(0, i + 1).map((x) => x.perf),
      { e1rmApplicable: opts.externalLoad },
    );
    calls.set(id, state === "insufficient" ? "insufficient" : state);
  });
  return calls;
}

/** One point per finished performance with a qualifying set, chronological. */
function points(
  rows: HistoryRow[],
  value: (sets: WorkingSet[]) => number | null,
): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const r of chronological(rows.filter((x) => x.finished))) {
    const v = value(r.perf.workingSets);
    if (v === null) continue;
    out.push({
      loggedExerciseId: r.perf.loggedExerciseId,
      dateIso: r.perf.dateIso,
      value: v,
      scheduledDeload: r.perf.scheduledDeload,
      workingSets: r.perf.workingSets.slice().sort(bySetNumber),
    });
  }
  return out;
}

/** e1RM view: the session e1RM (best working set's estimate), rounded — as the existing chart. */
export function e1rmPoints(rows: HistoryRow[]): TrendPoint[] {
  return points(rows, (sets) => {
    const loaded = loadedSets(sets);
    return loaded.length > 0 ? Math.round(sessionE1rm(loaded)) : null;
  });
}

/** Weight view (R14): the heaviest working-set load — a load that was on the bar. */
export function weightPoints(rows: HistoryRow[]): TrendPoint[] {
  return points(rows, (sets) => {
    const loaded = loadedSets(sets);
    return loaded.length > 0
      ? Math.max(...loaded.map((s) => s.weightLbs))
      : null;
  });
}

/** Reps view (bodyweight, R14): the most reps in a working set. */
export function repsPoints(rows: HistoryRow[]): TrendPoint[] {
  return points(rows, (sets) =>
    sets.length > 0 ? Math.max(...sets.map((s) => s.reps)) : null,
  );
}

/** The latest point outside a scheduled-deload week (R29), or null. */
export function latestValue(pts: TrendPoint[]): number | null {
  for (let i = pts.length - 1; i >= 0; i--) {
    if (!pts[i].scheduledDeload) return pts[i].value;
  }
  return null;
}
