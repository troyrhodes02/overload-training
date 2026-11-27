import "server-only";
import { planSnapshot } from "@/lib/logging/snapshot";
import { isUuid } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountDb } from "@/lib/data/account-db";
import {
  formatPlanDate,
  mesocycleWeekForDate,
  toIsoDate,
} from "@overload/shared/plan/calendar";
import { isGymVariable } from "@overload/shared/exercises/gym-variable";
import { requiresExternalWeight } from "@overload/shared/exercises/loading-mode";
import { prescriptionOf } from "@overload/shared/progression/recurring";
import { rowSegmentEndingAt, segmentRows, type RowAnchor } from "./recurring";
import { PROGRESS_INCREMENT_LBS } from "@overload/shared/progression/config";
import {
  can,
  entitlementFor,
  type RequestEntitlement,
} from "@/lib/entitlements/resolve";
import {
  gateOccurrence,
  gatePlanned,
  gateSessionSummary,
} from "@/lib/entitlements/gate";
import {
  isScheduledDeloadWeek,
  scheduledDeloadLoad,
} from "@overload/shared/progression/deload";
import {
  byDate,
  evaluateReactiveDecision,
  qualifyingSequence,
  type Performance,
  type ReactiveDecision,
  type ReactiveState,
} from "@overload/shared/progression/engine";
import {
  bestWorkingSet,
  loadedSets,
  sessionE1rm,
} from "@overload/shared/progression/e1rm";
import { exerciseHistoryHref } from "./history-href";
import {
  buildRecommendation,
  insufficientNote,
} from "@overload/shared/progression/recommendation";
import type {
  E1rmPointDto,
  ProgressionTag,
  RecommendationDto,
  RirEffect,
  SuggestedLoadDto,
} from "@overload/shared/progression/types";
import type {
  OccurrenceProgressionDto,
  SessionProgressionSummaryDto,
  PlannedProgressionDto,
} from "@overload/shared/contracts/progression";
export type {
  OccurrenceProgressionDto,
  SessionProgressionSummaryDto,
  PlannedProgressionDto,
} from "@overload/shared/contracts/progression";

/**
 * Server-side read layer for the Progressive Overload Engine (spec §11, §11a,
 * §13). It gathers logged history through Prisma, builds pure `Performance`
 * objects, composes the pure engine, and returns the UI DTOs. It performs NO
 * writes and stores nothing: every value here is derived on read (R1, R45).
 *
 * Gym scope (R11–R14, R42): a gym-consistent exercise is evaluated globally; a
 * gym-variable exercise is evaluated within one gym's history only — nominal
 * machine pounds are never compared across gyms.
 *
 * Loading mode (requiresExternalWeight): a pure bodyweight exercise runs the
 * same rep-range rule, but has no e1RM (no points, no current value, no stall
 * gate) and no load suggestion — never a +5 lb or 90% number on a missing weight.
 *
 * Recommendations (Smarter & Explainable Progression §11.4): every DTO carries
 * `recommendation`, built by `buildRecommendation` from the same decision that
 * produced the tag and the same working-weight source the suggestion uses.
 * Nothing is stored; a corrected set changes the words on the next read.
 */

export type {
  ProgressionTag,
  SuggestedLoadDto,
  E1rmPointDto,
  RecommendationDto,
  RirEffect,
} from "@overload/shared/progression/types";

export type ExerciseProgressionDto = {
  exerciseId: string;
  exerciseName: string;
  isGymVariable: boolean;
  /** False for a pure bodyweight exercise: no e1RM trend and no load suggestion. */
  requiresExternalWeight: boolean;
  isArchived: boolean;
  gyms: { id: string; name: string }[];
  selectedGymId: string | null;
  selectedGymName: string | null;
  state: ReactiveState;
  tag: ProgressionTag | null;
  /** The RIR qualifier that changed the call, if any (RIR Logging §6). */
  rirEffect: RirEffect;
  suggestion: SuggestedLoadDto;
  /** What to do next time and why; null when there is not enough history. */
  recommendation: RecommendationDto | null;
  /** The exercise page's not-enough-history line; null otherwise (R20). */
  insufficientNote: string | null;
  currentE1rm: number | null;
  qualifyingCount: number;
  points: E1rmPointDto[];
};

/** Hold and insufficient history both render as no tag (R7, R53). */
function toTag(state: ReactiveState): ProgressionTag | null {
  return state === "progress" || state === "deload" || state === "stalled"
    ? state
    : null;
}

/** One gathered performance plus the display context the chart needs. */
export type PerformanceRow = {
  perf: Performance;
  loggedSessionId: string;
  gymName: string | null;
  /** The gym was archived after this was logged (history keeps its name). */
  gymArchived: boolean;
  /** Sets beyond the plan (setNumber > plannedSets): shown, never judged. */
  extraSets: Performance["workingSets"];
  /** The exercise the plan named; differs from the performed one after a swap. */
  plannedExerciseId: string;
  plannedExerciseName: string;
  /** The plan's set count for this occurrence (its preserved snapshot). */
  plannedSets: number;
  completed: boolean; // session complete AND all planned working sets present
  /**
   * Recurring-exercise identity and order (Prescription-Aware Intelligence
   * §6): the workout's session lineage (null when it had no session), its
   * session name, and the occurrence's creation time (same-date tie-break).
   */
  lineageId: string | null;
  sessionName: string | null;
  createdAtIso: string;
  /**
   * Session complete, regardless of how many planned sets were logged. Strength
   * reads (e1RM trend, goal progress) use this: a set the lifter actually did
   * demonstrates strength even when they stopped short of the plan. The
   * reactive tag keeps the strict `completed` flag.
   */
  finished: boolean;
};
type Row = PerformanceRow;

/**
 * Gather every performance of the PERFORMED exercise (R10), with its preserved
 * plan context (R8), effective mesocycle week, scheduled-deload flag, gym, and
 * working sets. A performance is `completed` iff its LoggedSession is complete
 * and all planned working sets are present (R9, R44).
 *
 * UNGATED (OVE-137 / audit F-T11): this computes Pro content (calls,
 * recommendations, e1RM trends) with no capability check. No page, action, or
 * route may call it; only the gated readers in this folder do
 * (getPlannedProgression, getOccurrenceProgression,
 * getSessionProgressionSummary here; getExerciseHistory in history-queries.ts).
 * tests/unit/progression-gate-guards.test.ts enforces that.
 */
export async function gatherRows(
  account: Account,
  exerciseId: string,
  db: AccountDb = account.db,
): Promise<Row[]> {
  // Planned workouts only (Pitch 25 RD-25): a Wing-It workout has no plan,
  // so it never enters a segment, a call, or the stall check. Its sets reach
  // the strength reads (records, trend, goals) through gatherWingItRows.
  const les = await db.loggedExercise.findMany({
    where: { exerciseId, loggedSession: { kind: "planned" } },
    include: {
      sets: { orderBy: { setNumber: "asc" } },
      gym: { select: { name: true, deletedAt: true } },
      plannedExercise: { select: { name: true } },
      loggedSession: {
        select: {
          status: true,
          createdAt: true,
          scheduledFor: true,
          session: { select: { lineageId: true, name: true } },
          mesocycle: {
            select: { startDate: true, deloadEveryWeeks: true },
          },
        },
      },
    },
  });

  return les.flatMap((le) => {
    const plan = planSnapshot(le);
    if (!plan) return []; // unreachable: a planned workout keeps its plan
    const scheduledForIso = toIsoDate(le.loggedSession.scheduledFor);
    const startDate = le.loggedSession.mesocycle?.startDate
      ? toIsoDate(le.loggedSession.mesocycle.startDate)
      : null;
    const week = startDate
      ? (mesocycleWeekForDate(startDate, scheduledForIso) ?? 1)
      : 1;
    const deloadEvery = le.loggedSession.mesocycle?.deloadEveryWeeks ?? 0;
    const scheduledDeload = isScheduledDeloadWeek(week, deloadEvery);

    const workingSets = le.sets
      .filter((s) => s.setNumber >= 1 && s.setNumber <= plan.plannedSets)
      .map((s) => ({
        setNumber: s.setNumber,
        weightLbs: s.weightLbs === null ? null : Number(s.weightLbs),
        reps: s.reps,
        rir: s.rir,
      }));
    const extraSets = le.sets
      .filter((s) => s.setNumber > plan.plannedSets)
      .map((s) => ({
        setNumber: s.setNumber,
        weightLbs: s.weightLbs === null ? null : Number(s.weightLbs),
        reps: s.reps,
        rir: s.rir,
      }));
    const completed =
      le.loggedSession.status === "complete" &&
      workingSets.length >= plan.plannedSets;

    return {
      perf: {
        loggedExerciseId: le.id,
        dateIso: scheduledForIso,
        week,
        scheduledDeload,
        gymId: le.gymId,
        complete: completed,
        finished: le.loggedSession.status === "complete",
        repMin: plan.repMin,
        repMax: plan.repMax,
        workingSets,
      },
      loggedSessionId: le.loggedSessionId,
      gymName: le.gym?.name ?? null,
      gymArchived: le.gym?.deletedAt != null,
      extraSets,
      plannedExerciseId: le.plannedExerciseId,
      plannedExerciseName: le.plannedExercise.name,
      plannedSets: plan.plannedSets,
      lineageId: le.loggedSession.session?.lineageId ?? null,
      sessionName: le.loggedSession.session?.name ?? null,
      createdAtIso: le.createdAt.toISOString(),
      completed,
      finished: le.loggedSession.status === "complete",
    };
  });
}

/** One qualifying performance's session-level e1RM, with the set behind it. */
export type QualifyingE1rm = {
  loggedExerciseId: string;
  loggedSessionId: string;
  dateIso: string;
  gymId: string | null;
  /** Precise (unrounded) session-level e1RM (R18). */
  e1rm: number;
  /** The working set that produced `e1rm`. */
  bestSet: { weightLbs: number; reps: number };
};

/**
 * Qualifying session-level e1RMs for one PERFORMED exercise, chronological —
 * a finished session with at least one loaded set, not a scheduled-deload
 * week (R38). Unlike the reactive engine this does NOT require every planned
 * working set: demonstrated strength counts even when the lifter did fewer
 * sets than planned. Scope:
 * `gymId` null → every gym (gym-consistent); an id → that gym only
 * (gym-variable; nominal machine pounds never cross gyms, R12). Read-only;
 * consumed by Goals (Pitch 6) so goal progress shares this module's notion of
 * demonstrated strength instead of defining a second one.
 *
 * `db` lets a caller that is inside a transaction read on that transaction's
 * connection and snapshot (Goals' createGoal); reads only — never a write.
 */
export async function getQualifyingSessionE1rms(
  account: Account,
  exerciseId: string,
  gymId: string | null,
  db: AccountDb = account.db,
): Promise<QualifyingE1rm[]> {
  const rows = await gatherRows(account, exerciseId, db);
  const scoped = (
    gymId ? rows.filter((r) => r.perf.gymId === gymId) : rows
  ).filter((r) => r.finished && !r.perf.scheduledDeload);
  const sessionOf = new Map(
    scoped.map((r) => [r.perf.loggedExerciseId, r.loggedSessionId]),
  );
  const out: QualifyingE1rm[] = [];
  const chronological = scoped
    .map((r) => r.perf)
    .sort((a, b) =>
      a.dateIso !== b.dateIso
        ? a.dateIso < b.dateIso
          ? -1
          : 1
        : a.loggedExerciseId < b.loggedExerciseId
          ? -1
          : 1,
    );
  for (const p of chronological) {
    // Only sets with an external load have an e1RM (bodyweight sets never do).
    const loaded = loadedSets(p.workingSets);
    const best = bestWorkingSet(loaded);
    if (!best) continue;
    out.push({
      loggedExerciseId: p.loggedExerciseId,
      loggedSessionId: sessionOf.get(p.loggedExerciseId) as string,
      dateIso: p.dateIso,
      gymId: p.gymId,
      e1rm: sessionE1rm(loaded),
      bestSet: { weightLbs: best.weightLbs, reps: best.reps },
    });
  }
  return out;
}

/** Chronological chart points: one per FINISHED performance with a loaded set,
 *  scheduled-deload points included and marked (R39). */
function toPoints(
  rows: Row[],
  gymNameOverride?: string | null,
): E1rmPointDto[] {
  return rows
    .filter((r) => r.finished && loadedSets(r.perf.workingSets).length > 0)
    .slice()
    .sort((a, b) => (a.perf.dateIso < b.perf.dateIso ? -1 : 1))
    .map((r) => ({
      dateIso: r.perf.dateIso,
      dateLabel: formatPlanDate(r.perf.dateIso),
      e1rm: Math.round(sessionE1rm(loadedSets(r.perf.workingSets))),
      scheduledDeload: r.perf.scheduledDeload,
      gymName: gymNameOverride !== undefined ? gymNameOverride : r.gymName,
    }));
}

/** Most recent NON-deload finished e1RM point in scope (R42); null if none. */
function currentE1rm(rows: Row[]): number | null {
  const pts = rows
    .filter(
      (r) =>
        r.finished &&
        !r.perf.scheduledDeload &&
        loadedSets(r.perf.workingSets).length > 0,
    )
    .sort((a, b) => (a.perf.dateIso < b.perf.dateIso ? -1 : 1));
  const last = pts[pts.length - 1];
  return last
    ? Math.round(sessionE1rm(loadedSets(last.perf.workingSets)))
    : null;
}

/**
 * The working weight a call's number is built from (Prescription-Aware
 * Intelligence RD-10): the top planned working set of the most recent
 * FINISHED, non-scheduled-deload performance in the segment the engine judged
 * — never another recurring workout's, never a gym baseline (RD-9), and never
 * a deload week's reduced load (so a 90% suggestion never compounds).
 */
export function segmentWorkingWeight(rows: readonly Row[]): number | null {
  const normal = rows
    .filter((r) => r.finished && !r.perf.scheduledDeload)
    .slice()
    .sort((a, b) => byDate(b.perf, a.perf));
  for (const r of normal) {
    const loads = loadedSets(r.perf.workingSets).map((s) => s.weightLbs);
    if (loads.length > 0) return Math.max(...loads);
  }
  return null;
}

/** 90% of the segment's last normal working weight, rounded down (R33–R36). */
function scheduledDeloadSuggestion(
  segment: readonly Row[],
  externalLoad: boolean,
): SuggestedLoadDto {
  // Bodyweight: no load to reduce to 90% of; show the state without a number.
  if (!externalLoad) return null;
  const base = segmentWorkingWeight(segment);
  if (base == null) return null; // show state without a number (R36)
  return { lbs: scheduledDeloadLoad(base), kind: "scheduled_deload" };
}

/** The most recent finished performance in scope (session complete), or null. */
function latestFinished(rows: Row[]): Row | null {
  const done = rows
    .filter((r) => r.finished)
    .sort((a, b) => byDate(a.perf, b.perf));
  return done[done.length - 1] ?? null;
}

/**
 * The suggestion and the recommendation for one evaluated decision (spec
 * §11.4). One place, so the card, the summary, the planned list, and the
 * exercise page can never word the same evaluation differently.
 *
 * The weight is the single working-weight source, read from completed
 * workouts only (R9) — and printed only when it can be trusted (R33): a free
 * weight's number must be the load of the judged session's TOP working set
 * (the same top-set anchor the source uses, OVE-61; otherwise an extra back-off
 * set, or a later unjudged workout, would be the number); a gym baseline is the
 * machine's authority (Progressive
 * Overload Engine R30), unless the in-progress workout itself rewrote it.
 * An untrusted number is withheld, never replaced: "Ready to add weight",
 * "Hold steady" (Progressive Overload Engine R31).
 */
async function describeDecision(
  account: Account,
  args: {
    exerciseId: string;
    gymId: string | null;
    gymVariable: boolean;
    externalLoad: boolean;
    decision: ReactiveDecision;
    scopeRows: Row[];
    gymName: string | null;
    when: "today" | "next";
    referenceIso: string;
  },
): Promise<{
  suggestion: SuggestedLoadDto;
  recommendation: RecommendationDto | null;
}> {
  const { decision } = args;
  // A reassess prints no weight (Workout Logging Refinements RD-5), so it
  // needs no working-weight read.
  const needsWeight =
    args.externalLoad &&
    decision.evidence.kind !== "reassess" &&
    (decision.state === "progress" ||
      decision.state === "hold" ||
      decision.state === "stalled");
  // The same segment the engine judged supplies the number, and it prints
  // only when it is the judged session's top load — for every equipment type
  // now that the gym baseline is not a source (RD-9, RD-10; R33).
  const read = needsWeight ? segmentWorkingWeight(args.scopeRows) : null;
  const trusted =
    read !== null && read === decision.latestTopLoadLbs ? read : null;
  // Bodyweight never gets "+5 lb"; no trusted weight → no number (R31).
  const suggestion: SuggestedLoadDto =
    decision.state === "progress" && trusted !== null
      ? { lbs: trusted + PROGRESS_INCREMENT_LBS, kind: "progress_increment" }
      : null;
  const e = decision.evidence;
  const latestId = "latest" in e ? e.latest.loggedExerciseId : null;
  const recommendation = buildRecommendation({
    scheduledDeload: false,
    state: decision.state,
    rirEffect: decision.rirEffect,
    evidence: e,
    externalLoad: args.externalLoad,
    workingWeightLbs: decision.state === "progress" ? null : trusted,
    progressLoadLbs: suggestion?.lbs ?? null,
    gymName: args.gymVariable ? args.gymName : null,
    latestIsLastTime:
      latestId !== null &&
      latestFinished(args.scopeRows)?.perf.loggedExerciseId === latestId,
    referenceIso: args.referenceIso,
    when: args.when,
  });
  return { suggestion, recommendation };
}

/** The exercise fields a progression description needs. */
export type ScopeExercise = {
  id: string;
  name: string;
  equipmentType: Parameters<typeof isGymVariable>[0]["equipmentType"];
  deletedAt: Date | null;
};

/** What one scope of an exercise's history says now (one evaluation). */
export type ScopeDescription = Pick<
  ExerciseProgressionDto,
  | "state"
  | "tag"
  | "rirEffect"
  | "suggestion"
  | "recommendation"
  | "insufficientNote"
  | "currentE1rm"
  | "qualifyingCount"
  | "points"
>;

/**
 * The call, its words, and the e1RM trend for ONE scope of an exercise's
 * history: every gym for a gym-consistent exercise, one gym for a
 * gym-variable one (`gym` null → nothing in scope, never another gym's rows).
 * Shared by the progression section and Exercise History & PR Intelligence
 * (spec §11.1), so both describe the same rows the same way.
 *
 * UNGATED (OVE-137 / audit F-T11): this computes Pro content (calls,
 * recommendations, e1RM trends) with no capability check. No page, action, or
 * route may call it; only the gated readers in this folder do
 * (getPlannedProgression, getOccurrenceProgression,
 * getSessionProgressionSummary here; getExerciseHistory in history-queries.ts).
 * tests/unit/progression-gate-guards.test.ts enforces that.
 */
export async function describeScope(
  account: Account,
  exercise: ScopeExercise,
  rows: Row[],
  gym: { id: string; name: string } | null,
  when: "today" | "next" = "next",
): Promise<ScopeDescription> {
  const gymVariable = isGymVariable(exercise);
  const externalLoad = requiresExternalWeight(exercise);
  const scopeRows = !gymVariable
    ? rows
    : gym
      ? rows.filter((r) => r.perf.gymId === gym.id)
      : [];
  const decision = evaluateReactiveDecision(
    scopeRows.map((r) => r.perf),
    gymVariable ? {} : { e1rmApplicable: externalLoad },
  );
  const { state, rirEffect } = decision;
  const { suggestion, recommendation } = await describeDecision(account, {
    exerciseId: exercise.id,
    gymId: gymVariable ? (gym?.id ?? null) : null,
    gymVariable,
    externalLoad: gymVariable ? true : externalLoad,
    decision,
    scopeRows,
    gymName: gymVariable ? (gym?.name ?? null) : null,
    when,
    referenceIso: latestFinished(scopeRows)?.perf.dateIso ?? "",
  });
  const trendApplicable = gymVariable || externalLoad;
  return {
    state,
    tag: toTag(state),
    rirEffect,
    suggestion,
    recommendation,
    insufficientNote: insufficientNote(
      decision.evidence,
      gymVariable && gym ? gym.name : null,
    ),
    currentE1rm: trendApplicable ? currentE1rm(scopeRows) : null,
    qualifyingCount: qualifyingSequence(scopeRows.map((r) => r.perf)).length,
    points: trendApplicable
      ? toPoints(scopeRows, gymVariable ? (gym?.name ?? null) : null)
      : [],
  };
}

/**
 * Per-exercise progression state + e1RM trend for the detail page. For a
 * gym-variable exercise the active scope is one gym (selected or most-recent);
 * for a gym-consistent exercise it is the global history. The recommendation
 * advises the next session (`when: "next"`); the planned list asks for today's.
 *
 * UNGATED (OVE-137 / audit F-T11): this computes Pro content (calls,
 * recommendations, e1RM trends) with no capability check. No page, action, or
 * route may call it; only the gated readers in this folder do
 * (getPlannedProgression, getOccurrenceProgression,
 * getSessionProgressionSummary here; getExerciseHistory in history-queries.ts).
 * tests/unit/progression-gate-guards.test.ts enforces that.
 */
export async function getExerciseProgression(
  account: Account,
  exerciseId: string,
  requestedGymId?: string | null,
  { when = "next" }: { when?: "today" | "next" } = {},
): Promise<ExerciseProgressionDto | null> {
  const exercise = await account.db.exercise.findUnique({
    where: { id: exerciseId },
    select: { id: true, name: true, equipmentType: true, deletedAt: true },
  });
  if (!exercise) return null;

  const gymVariable = isGymVariable(exercise);
  const externalLoad = requiresExternalWeight(exercise);
  const rows = await gatherRows(account, exerciseId);
  const base = {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    isArchived: exercise.deletedAt !== null,
  };

  if (!gymVariable) {
    return {
      ...base,
      isGymVariable: false,
      requiresExternalWeight: externalLoad,
      gyms: [],
      selectedGymId: null,
      selectedGymName: null,
      ...(await describeScope(account, exercise, rows, null, when)),
    };
  }

  // Gym-variable: scope to a single gym (R12–R14). List gyms that have at least
  // one completed performance, most-recent first.
  const gyms = gymsWithFinishedHistory(rows);
  const selectedGymId =
    requestedGymId && gyms.some((g) => g.id === requestedGymId)
      ? requestedGymId
      : (gyms[0]?.id ?? null);
  const selectedGymName =
    gyms.find((g) => g.id === selectedGymId)?.name ?? null;

  return {
    ...base,
    isGymVariable: true,
    requiresExternalWeight: true,
    gyms,
    selectedGymId,
    selectedGymName,
    ...(await describeScope(
      account,
      exercise,
      rows,
      selectedGymId && selectedGymName
        ? { id: selectedGymId, name: selectedGymName }
        : null,
      when,
    )),
  };
}

/** Gyms with at least one finished performance, most recent first (R13). */
export function gymsWithFinishedHistory(
  rows: Row[],
): { id: string; name: string }[] {
  const gymRows = rows.filter((r) => r.finished && r.perf.gymId);
  const latestByGym = new Map<string, { name: string; dateIso: string }>();
  for (const r of gymRows) {
    const id = r.perf.gymId as string;
    const prev = latestByGym.get(id);
    if (!prev || prev.dateIso < r.perf.dateIso) {
      latestByGym.set(id, {
        name: r.gymName ?? "Gym",
        dateIso: r.perf.dateIso,
      });
    }
  }
  return [...latestByGym.entries()]
    .sort((a, b) => (a[1].dateIso > b[1].dateIso ? -1 : 1))
    .map(([id, v]) => ({ id, name: v.name }));
}

/**
 * Progression for a planned exercise on the dashboard, BEFORE the workout gym is
 * selected (spec §7; design Screen 1). Gym-variable exercises defer their call
 * until a gym is chosen (R14, R15): no tag, no fabricated number. Gym-consistent
 * exercises show their global call now; during a scheduled-deload week the
 * reactive tag is suppressed and the 90% load is shown instead (R37).
 */
/**
 * Whether the exercise has a trend to show — the same points the exercise
 * page draws for its default scope (all history; a machine's most recent gym).
 */
function trendExists(exercise: ScopeExercise, rows: Row[]): boolean {
  if (isGymVariable(exercise)) {
    const gym = gymsWithFinishedHistory(rows)[0];
    if (!gym) return false;
    return (
      toPoints(
        rows.filter((r) => r.perf.gymId === gym.id),
        gym.name,
      ).length > 0
    );
  }
  if (!requiresExternalWeight(exercise)) return false;
  return toPoints(rows, null).length > 0;
}

export type PlannedOccurrence = {
  /** The planned (or, once started, performed) exercise. */
  exerciseId: string;
  /** Today's session: its lineage names the recurring workout. */
  sessionId: string;
  /** Set once the workout started: its copied plan values are the anchor. */
  loggedSessionId: string | null;
};

export async function getPlannedProgression(
  account: Account,
  occurrence: PlannedOccurrence,
  opts: { scheduledDeloadWeek: boolean; entitlement?: RequestEntitlement },
): Promise<PlannedProgressionDto> {
  const dto = await computePlannedProgression(account, occurrence, opts);
  // A view that already resolved this account's entitlement for the request
  // passes it in (Pitch 21c RD-16); one for any other account is ignored.
  const resolved = await entitlementFor(account, opts.entitlement);
  return gatePlanned(dto, can(resolved, "progression_insights"));
}

/**
 * Today's anchor (Prescription-Aware Intelligence RD-11): a started workout's
 * copied plan values for this exercise, else the plan's SessionExercise; the
 * lineage from today's session. Null when neither exists for this account.
 */
async function plannedAnchor(
  account: Account,
  occurrence: PlannedOccurrence,
  gymVariable: boolean,
): Promise<RowAnchor | null> {
  if (!isUuid(occurrence.sessionId)) return null;
  const session = await account.db.session.findUnique({
    where: { id: occurrence.sessionId },
    select: { lineageId: true },
  });
  if (!session) return null;
  if (occurrence.loggedSessionId && isUuid(occurrence.loggedSessionId)) {
    const le = await account.db.loggedExercise.findFirst({
      where: {
        loggedSessionId: occurrence.loggedSessionId,
        exerciseId: occurrence.exerciseId,
      },
      select: { targetRepMin: true, targetRepMax: true, gymId: true },
    });
    const plan = le ? planSnapshot({ ...le, plannedSets: 0 }) : null;
    if (le && plan) {
      return {
        key: {
          lineageId: session.lineageId,
          exerciseId: occurrence.exerciseId,
          gymId: le.gymId,
        },
        prescription: prescriptionOf({
          targetRepMin: plan.repMin,
          targetRepMax: plan.repMax,
        }),
        gymVariable,
      };
    }
  }
  const se = await account.db.sessionExercise.findFirst({
    where: {
      sessionId: occurrence.sessionId,
      exerciseId: occurrence.exerciseId,
    },
    select: { targetRepMin: true, targetRepMax: true },
  });
  if (!se) return null;
  return {
    key: {
      lineageId: session.lineageId,
      exerciseId: occurrence.exerciseId,
      gymId: null,
    },
    prescription: prescriptionOf(se),
    gymVariable,
  };
}

async function computePlannedProgression(
  account: Account,
  occurrence: PlannedOccurrence,
  opts: { scheduledDeloadWeek: boolean },
): Promise<Omit<PlannedProgressionDto, "locked">> {
  const empty = {
    tag: null,
    rirEffect: null,
    gymVariable: false,
    suggestion: null,
    hasTrend: false,
    recommendation: null,
  } as const;
  const exercise = isUuid(occurrence.exerciseId)
    ? await account.db.exercise.findUnique({
        where: { id: occurrence.exerciseId },
        select: { id: true, name: true, equipmentType: true, deletedAt: true },
      })
    : null;
  if (!exercise) return empty;
  // One history read serves both the trend fact and the segment.
  const rows = await gatherRows(account, exercise.id);
  const hasTrend = trendExists(exercise, rows);
  if (isGymVariable(exercise)) {
    // A machine's call waits for the gym (R14, R15).
    return { ...empty, gymVariable: true, hasTrend };
  }
  const anchor = await plannedAnchor(account, occurrence, false);
  if (!anchor) return { ...empty, hasTrend };
  const segment = segmentRows(rows, exercise.id, anchor);
  if (opts.scheduledDeloadWeek) {
    return {
      ...empty,
      suggestion: scheduledDeloadSuggestion(
        segment,
        requiresExternalWeight(exercise),
      ),
      hasTrend,
    };
  }
  const d = await describeScope(account, exercise, segment, null, "today");
  return {
    tag: d.tag,
    rirEffect: d.rirEffect,
    gymVariable: false,
    suggestion: d.suggestion,
    hasTrend,
    recommendation: d.recommendation,
  };
}

/**
 * The reactive call + suggested load for a single planned occurrence (today's
 * card / dashboard). Scheduled-deload weeks suppress all reactive evaluation and
 * show a 90% load instead (R37); otherwise the exercise's history (gym-scoped for
 * gym-variable at this occurrence's gym) decides the tag.
 */
export async function getOccurrenceProgression(
  account: Account,
  loggedExerciseId: string,
  opts: { entitlement?: RequestEntitlement } = {},
): Promise<OccurrenceProgressionDto | null> {
  // A malformed id is simply not found (OVE-136 / audit F-T10).
  if (!isUuid(loggedExerciseId)) return null;
  const dto = await computeOccurrenceProgression(account, loggedExerciseId);
  if (!dto) return null;
  const resolved = await entitlementFor(account, opts.entitlement);
  return gateOccurrence(dto, can(resolved, "progression_insights"));
}

async function computeOccurrenceProgression(
  account: Account,
  loggedExerciseId: string,
): Promise<Omit<OccurrenceProgressionDto, "locked"> | null> {
  const le = await account.db.loggedExercise.findUnique({
    where: { id: loggedExerciseId },
    include: {
      exercise: { select: { id: true, equipmentType: true } },
      gym: { select: { name: true } },
      loggedSession: {
        select: {
          status: true,
          scheduledFor: true,
          session: { select: { lineageId: true } },
          mesocycle: { select: { startDate: true, deloadEveryWeeks: true } },
        },
      },
    },
  });
  if (!le) return null;
  // An open-ended Wing-It exercise has no plan to judge against (RD-10): no
  // call, no suggestion, and nothing locked — there is nothing to withhold.
  const plan = planSnapshot(le);
  if (!plan) return null;

  const gymVariable = isGymVariable(le.exercise);
  const externalLoad = requiresExternalWeight(le.exercise);
  const scheduledForIso = toIsoDate(le.loggedSession.scheduledFor);
  const startDate = le.loggedSession.mesocycle?.startDate
    ? toIsoDate(le.loggedSession.mesocycle.startDate)
    : null;
  const week = startDate
    ? (mesocycleWeekForDate(startDate, scheduledForIso) ?? 1)
    : 1;
  const scheduledDeloadWeek = isScheduledDeloadWeek(
    week,
    le.loggedSession.mesocycle?.deloadEveryWeeks ?? 0,
  );

  // While the session is in progress the card advises today's workout, judged
  // on finished history — so its numbers come from finished workouts too
  // (R9, R18, R33): segmentWorkingWeight reads finished performances only.
  const inProgress = le.loggedSession.status !== "complete";

  const rows = await gatherRows(account, le.exercise.id);
  const gymRows = gymVariable
    ? rows.filter((r) => r.perf.gymId === le.gymId)
    : rows;
  // The evidence: this recurring workout's comparable run, judged against the
  // plan copied when this workout started (Prescription-Aware Intelligence
  // §7.3; RD-13 — a later plan edit never changes it).
  // The run ENDING AT this occurrence (review of #227): a later workout at a
  // changed prescription never empties a past workout's evidence, and a
  // workout logged late is judged on what came before it — the same run the
  // exercise page's session rows use.
  const self = rows.find((r) => r.perf.loggedExerciseId === le.id);
  const scopeRows = self
    ? rowSegmentEndingAt(rows, le.exercise.id, self, gymVariable)
    : segmentRows(rows, le.exercise.id, {
        key: {
          lineageId: le.loggedSession.session?.lineageId ?? null,
          exerciseId: le.exercise.id,
          gymId: le.gymId,
        },
        prescription: prescriptionOf({
          targetRepMin: plan.repMin,
          targetRepMax: plan.repMax,
        }),
        gymVariable,
      });
  // Any finished workout in scope has a history to link to (R4), bodyweight too.
  const historyHref = gymRows.some((r) => r.finished)
    ? exerciseHistoryHref(
        le.exercise.id,
        gymVariable ? { gymId: le.gymId } : null,
      )
    : null;

  if (scheduledDeloadWeek) {
    // Reactive evaluation is suppressed entirely during a scheduled-deload week
    // (R37): no tag, only the reduced-load suggestion — and no engine call.
    const suggestion = scheduledDeloadSuggestion(scopeRows, externalLoad);
    return {
      loggedExerciseId,
      scheduledDeloadWeek: true,
      tag: null,
      rirEffect: null,
      suggestion,
      historyHref,
      recommendation: buildRecommendation({
        scheduledDeload: true,
        externalLoad,
        deloadLoadLbs: suggestion?.lbs ?? null,
      }),
      insufficientNote: null,
    };
  }

  const decision = evaluateReactiveDecision(
    scopeRows.map((r) => r.perf),
    {
      e1rmApplicable: externalLoad,
    },
  );
  const { state, rirEffect } = decision;
  const { suggestion, recommendation } = await describeDecision(account, {
    exerciseId: le.exercise.id,
    gymId: le.gymId,
    gymVariable,
    externalLoad,
    decision,
    scopeRows,
    gymName: le.gym?.name ?? null,
    when: inProgress ? "today" : "next",
    referenceIso: scheduledForIso,
  });
  return {
    loggedExerciseId,
    scheduledDeloadWeek: false,
    tag: toTag(state),
    rirEffect,
    suggestion,
    historyHref,
    recommendation,
    // The exercise page's own not-enough-history line (Pitch 21g RD-3): set
    // only by the engine's `insufficient` evidence, so it can never stand in
    // for a call. A machine's line names this occurrence's gym.
    insufficientNote: insufficientNote(
      decision.evidence,
      gymVariable ? (le.gym?.name ?? null) : null,
    ),
  };
}

/**
 * Per-performed-exercise progression for the completion summary (R52). Reuses
 * the occurrence logic so the summary and the card never disagree.
 */
export async function getSessionProgressionSummary(
  account: Account,
  loggedSessionId: string,
  opts: { entitlement?: RequestEntitlement } = {},
): Promise<SessionProgressionSummaryDto | null> {
  // A malformed id is simply not found (OVE-136 / audit F-T10).
  if (!isUuid(loggedSessionId)) return null;
  const dto = await computeSessionProgressionSummary(account, loggedSessionId);
  if (!dto) return null;
  const resolved = await entitlementFor(account, opts.entitlement);
  return gateSessionSummary(dto, can(resolved, "progression_insights"));
}

async function computeSessionProgressionSummary(
  account: Account,
  loggedSessionId: string,
): Promise<Omit<SessionProgressionSummaryDto, "locked"> | null> {
  const ls = await account.db.loggedSession.findUnique({
    where: { id: loggedSessionId },
    select: {
      id: true,
      kind: true,
      scheduledFor: true,
      mesocycle: { select: { startDate: true, deloadEveryWeeks: true } },
      loggedExercises: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          exercise: { select: { id: true, name: true } },
          plannedSets: true,
          sets: { select: { setNumber: true } },
          _count: { select: { sets: true } },
        },
      },
    },
  });
  // A Wing-It workout has no plan, so no call per lift (RD-10): no summary,
  // and no locked note on a Free account (nothing is withheld).
  if (!ls || ls.kind === "wing_it") return null;

  const startDate = ls.mesocycle?.startDate
    ? toIsoDate(ls.mesocycle.startDate)
    : null;
  const week = startDate
    ? (mesocycleWeekForDate(startDate, toIsoDate(ls.scheduledFor)) ?? 1)
    : 1;
  const scheduledDeloadWeek = isScheduledDeloadWeek(
    week,
    ls.mesocycle?.deloadEveryWeeks ?? 0,
  );

  // Exercises not done today get no summary row (a call about a lift the
  // lifter skipped would read as a verdict on today).
  const performed = ls.loggedExercises.filter((le) => le._count.sets > 0);
  const exercises = await Promise.all(
    performed.map(async (le) => {
      // The UNGATED occurrence: this summary is gated once, as a whole, by
      // gateSessionSummary below (so its `locked` marker sees what it withholds).
      const occ = await computeOccurrenceProgression(account, le.id);
      // A planned workout keeps its plan (CHECK, migration 9t).
      const plannedSets = le.plannedSets ?? 0;
      const loggedWorkingSets = le.sets.filter(
        (s) => s.setNumber >= 1 && s.setNumber <= plannedSets,
      ).length;
      return {
        performedExerciseId: le.exercise.id,
        performedExerciseName: le.exercise.name,
        tag: occ?.tag ?? null,
        rirEffect: occ?.rirEffect ?? null,
        suggestion: occ?.suggestion ?? null,
        historyHref: occ?.historyHref ?? null,
        recommendation: occ?.recommendation ?? null,
        plannedSets,
        loggedWorkingSets,
      };
    }),
  );

  return { loggedSessionId: ls.id, scheduledDeloadWeek, exercises };
}
