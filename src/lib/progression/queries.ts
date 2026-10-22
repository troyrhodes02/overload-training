import "server-only";
import type { Account } from "@/lib/data/account";
import type { AccountDb } from "@/lib/data/account-db";
import {
  formatPlanDate,
  mesocycleWeekForDate,
  toIsoDate,
} from "@/lib/plan/calendar";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { requiresExternalWeight } from "@/lib/exercises/loading-mode";
import {
  currentWorkingWeightLbs,
  type WorkingWeightOptions,
} from "@/lib/logging/queries";
import { PROGRESS_INCREMENT_LBS } from "./config";
import { isScheduledDeloadWeek, scheduledDeloadLoad } from "./deload";
import {
  byDate,
  evaluateReactiveDecision,
  qualifyingSequence,
  type Performance,
  type ReactiveDecision,
  type ReactiveState,
} from "./engine";
import { bestWorkingSet, loadedSets, sessionE1rm } from "./e1rm";
import { buildRecommendation, insufficientNote } from "./recommendation";
import type {
  E1rmPointDto,
  ProgressionTag,
  RecommendationDto,
  RirEffect,
  SuggestedLoadDto,
} from "./types";

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
} from "./types";

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

export type OccurrenceProgressionDto = {
  loggedExerciseId: string;
  scheduledDeloadWeek: boolean;
  tag: ProgressionTag | null;
  /** Null in a scheduled-deload week and whenever RIR didn't change the call. */
  rirEffect: RirEffect;
  suggestion: SuggestedLoadDto;
  hasTrend: boolean;
  /** Today's advice while the session is in progress, next time's once complete. */
  recommendation: RecommendationDto | null;
};

export type SessionProgressionSummaryDto = {
  loggedSessionId: string;
  scheduledDeloadWeek: boolean;
  exercises: {
    performedExerciseId: string;
    performedExerciseName: string;
    tag: ProgressionTag | null;
    rirEffect: RirEffect;
    suggestion: SuggestedLoadDto;
    hasTrend: boolean;
    recommendation: RecommendationDto | null;
  }[];
};

/** Hold and insufficient history both render as no tag (R7, R53). */
function toTag(state: ReactiveState): ProgressionTag | null {
  return state === "progress" || state === "deload" || state === "stalled"
    ? state
    : null;
}

/** One gathered performance plus the display context the chart needs. */
type Row = {
  perf: Performance;
  loggedSessionId: string;
  gymName: string | null;
  completed: boolean; // session complete AND all planned working sets present
  /**
   * Session complete, regardless of how many planned sets were logged. Strength
   * reads (e1RM trend, goal progress) use this: a set the lifter actually did
   * demonstrates strength even when they stopped short of the plan. The
   * reactive tag keeps the strict `completed` flag.
   */
  finished: boolean;
};

/**
 * Gather every performance of the PERFORMED exercise (R10), with its preserved
 * plan context (R8), effective mesocycle week, scheduled-deload flag, gym, and
 * working sets. A performance is `completed` iff its LoggedSession is complete
 * and all planned working sets are present (R9, R44).
 */
async function gatherRows(
  account: Account,
  exerciseId: string,
  db: AccountDb = account.db,
): Promise<Row[]> {
  const les = await db.loggedExercise.findMany({
    where: { exerciseId },
    include: {
      sets: { orderBy: { setNumber: "asc" } },
      gym: { select: { name: true } },
      loggedSession: {
        select: {
          status: true,
          createdAt: true,
          scheduledFor: true,
          mesocycle: {
            select: { startDate: true, deloadEveryWeeks: true },
          },
        },
      },
    },
  });

  return les.map((le) => {
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
      .filter((s) => s.setNumber >= 1 && s.setNumber <= le.plannedSets)
      .map((s) => ({
        setNumber: s.setNumber,
        weightLbs: s.weightLbs === null ? null : Number(s.weightLbs),
        reps: s.reps,
        rir: s.rir,
      }));
    const completed =
      le.loggedSession.status === "complete" &&
      workingSets.length >= le.plannedSets;

    return {
      perf: {
        loggedExerciseId: le.id,
        dateIso: scheduledForIso,
        week,
        scheduledDeload,
        gymId: le.gymId,
        complete: completed,
        repMin: le.targetRepMin,
        repMax: le.targetRepMax,
        workingSets,
      },
      loggedSessionId: le.loggedSessionId,
      gymName: le.gym?.name ?? null,
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

async function scheduledDeloadSuggestion(
  account: Account,
  exerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
  externalLoad: boolean,
  ww: WorkingWeightOptions = {},
): Promise<SuggestedLoadDto> {
  // Bodyweight: no load to reduce to 90% of; show the state without a number.
  if (!externalLoad) return null;
  const base = await currentWorkingWeightLbs(
    account,
    exerciseId,
    gymId,
    gymVariable,
    { completedOnly: true, ...ww },
  );
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
 * weight's number must be the load the judged session's last working set
 * used (otherwise an extra back-off set, or a later unjudged workout, would be
 * the number); a gym baseline is the machine's authority (Progressive
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
    baselineWrittenBefore?: Date;
  },
): Promise<{
  suggestion: SuggestedLoadDto;
  recommendation: RecommendationDto | null;
}> {
  const { decision } = args;
  const needsWeight =
    args.externalLoad &&
    (decision.state === "progress" ||
      decision.state === "hold" ||
      decision.state === "stalled");
  const read = needsWeight
    ? await currentWorkingWeightLbs(
        account,
        args.exerciseId,
        args.gymId,
        args.gymVariable,
        {
          completedOnly: true,
          baselineWrittenBefore: args.baselineWrittenBefore,
        },
      )
    : null;
  const trusted =
    read !== null && (args.gymVariable || read === decision.latestLoadLbs)
      ? read
      : null;
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

/**
 * Per-exercise progression state + e1RM trend for the detail page. For a
 * gym-variable exercise the active scope is one gym (selected or most-recent);
 * for a gym-consistent exercise it is the global history. The recommendation
 * advises the next session (`when: "next"`); the planned list asks for today's.
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

  if (!gymVariable) {
    const decision = evaluateReactiveDecision(
      rows.map((r) => r.perf),
      { e1rmApplicable: externalLoad },
    );
    const { state, rirEffect } = decision;
    const { suggestion, recommendation } = await describeDecision(account, {
      exerciseId,
      gymId: null,
      gymVariable: false,
      externalLoad,
      decision,
      scopeRows: rows,
      gymName: null,
      when,
      referenceIso: latestFinished(rows)?.perf.dateIso ?? "",
    });
    return {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      isGymVariable: false,
      requiresExternalWeight: externalLoad,
      isArchived: exercise.deletedAt !== null,
      gyms: [],
      selectedGymId: null,
      selectedGymName: null,
      state,
      tag: toTag(state),
      rirEffect,
      suggestion,
      recommendation,
      insufficientNote: insufficientNote(decision.evidence, null),
      currentE1rm: externalLoad ? currentE1rm(rows) : null,
      qualifyingCount: qualifyingSequence(rows.map((r) => r.perf)).length,
      points: externalLoad ? toPoints(rows, null) : [],
    };
  }

  // Gym-variable: scope to a single gym (R12–R14). List gyms that have at least
  // one completed performance, most-recent first.
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
  const gyms = [...latestByGym.entries()]
    .sort((a, b) => (a[1].dateIso > b[1].dateIso ? -1 : 1))
    .map(([id, v]) => ({ id, name: v.name }));

  const selectedGymId =
    requestedGymId && gyms.some((g) => g.id === requestedGymId)
      ? requestedGymId
      : (gyms[0]?.id ?? null);
  const selectedGymName =
    gyms.find((g) => g.id === selectedGymId)?.name ?? null;

  const scopeRows = selectedGymId
    ? rows.filter((r) => r.perf.gymId === selectedGymId)
    : [];
  const decision = evaluateReactiveDecision(scopeRows.map((r) => r.perf));
  const { state, rirEffect } = decision;
  const { suggestion, recommendation } = await describeDecision(account, {
    exerciseId,
    gymId: selectedGymId,
    gymVariable: true,
    externalLoad: true,
    decision,
    scopeRows,
    gymName: selectedGymName,
    when,
    referenceIso: latestFinished(scopeRows)?.perf.dateIso ?? "",
  });

  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    isGymVariable: true,
    requiresExternalWeight: true,
    isArchived: exercise.deletedAt !== null,
    gyms,
    selectedGymId,
    selectedGymName,
    state,
    tag: toTag(state),
    rirEffect,
    suggestion,
    recommendation,
    insufficientNote: insufficientNote(
      decision.evidence,
      selectedGymId ? selectedGymName : null,
    ),
    currentE1rm: currentE1rm(scopeRows),
    qualifyingCount: qualifyingSequence(scopeRows.map((r) => r.perf)).length,
    points: toPoints(scopeRows, selectedGymName),
  };
}

export type PlannedProgressionDto = {
  tag: ProgressionTag | null;
  /** Carried for consistency; the planned list renders only the recommendation's evidence. */
  rirEffect: RirEffect;
  gymVariable: boolean;
  suggestion: SuggestedLoadDto;
  hasTrend: boolean;
  /** Null for gym-variable exercises (no gym yet) and in a scheduled-deload week. */
  recommendation: RecommendationDto | null;
};

/**
 * Progression for a planned exercise on the dashboard, BEFORE the workout gym is
 * selected (spec §7; design Screen 1). Gym-variable exercises defer their call
 * until a gym is chosen (R14, R15): no tag, no fabricated number. Gym-consistent
 * exercises show their global call now; during a scheduled-deload week the
 * reactive tag is suppressed and the 90% load is shown instead (R37).
 */
export async function getPlannedProgression(
  account: Account,
  exerciseId: string,
  opts: { scheduledDeloadWeek: boolean },
): Promise<PlannedProgressionDto> {
  const base = await getExerciseProgression(account, exerciseId, null, {
    when: "today",
  });
  if (!base) {
    return {
      tag: null,
      rirEffect: null,
      gymVariable: false,
      suggestion: null,
      hasTrend: false,
      recommendation: null,
    };
  }
  const hasTrend = base.points.length > 0;
  if (base.isGymVariable) {
    return {
      tag: null,
      rirEffect: null,
      gymVariable: true,
      suggestion: null,
      hasTrend,
      recommendation: null,
    };
  }
  if (opts.scheduledDeloadWeek) {
    return {
      tag: null,
      rirEffect: null,
      gymVariable: false,
      suggestion: await scheduledDeloadSuggestion(
        account,
        exerciseId,
        null,
        false,
        base.requiresExternalWeight,
      ),
      hasTrend,
      recommendation: null,
    };
  }
  return {
    tag: base.tag,
    rirEffect: base.rirEffect,
    gymVariable: false,
    suggestion: base.suggestion,
    hasTrend,
    recommendation: base.recommendation,
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
): Promise<OccurrenceProgressionDto | null> {
  const le = await account.db.loggedExercise.findUnique({
    where: { id: loggedExerciseId },
    include: {
      exercise: { select: { id: true, equipmentType: true } },
      gym: { select: { name: true } },
      loggedSession: {
        select: {
          status: true,
          createdAt: true,
          scheduledFor: true,
          mesocycle: { select: { startDate: true, deloadEveryWeeks: true } },
        },
      },
    },
  });
  if (!le) return null;

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
  // on finished history — so its numbers come from finished workouts too,
  // and a baseline this workout rewrote is not its context (R9, R18, R33).
  const inProgress = le.loggedSession.status !== "complete";
  const baselineWrittenBefore = inProgress
    ? le.loggedSession.createdAt
    : undefined;

  const rows = await gatherRows(account, le.exercise.id);
  const scopeRows = gymVariable
    ? rows.filter((r) => r.perf.gymId === le.gymId)
    : rows;
  // A bodyweight exercise has no e1RM trend to link to.
  const hasTrend = externalLoad && scopeRows.some((r) => r.finished);

  if (scheduledDeloadWeek) {
    // Reactive evaluation is suppressed entirely during a scheduled-deload week
    // (R37): no tag, only the reduced-load suggestion — and no engine call.
    const suggestion = await scheduledDeloadSuggestion(
      account,
      le.exercise.id,
      le.gymId,
      gymVariable,
      externalLoad,
      { baselineWrittenBefore },
    );
    return {
      loggedExerciseId,
      scheduledDeloadWeek: true,
      tag: null,
      rirEffect: null,
      suggestion,
      hasTrend,
      recommendation: buildRecommendation({
        scheduledDeload: true,
        externalLoad,
        deloadLoadLbs: suggestion?.lbs ?? null,
      }),
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
    baselineWrittenBefore,
  });
  return {
    loggedExerciseId,
    scheduledDeloadWeek: false,
    tag: toTag(state),
    rirEffect,
    suggestion,
    hasTrend,
    recommendation,
  };
}

/**
 * Per-performed-exercise progression for the completion summary (R52). Reuses
 * the occurrence logic so the summary and the card never disagree.
 */
export async function getSessionProgressionSummary(
  account: Account,
  loggedSessionId: string,
): Promise<SessionProgressionSummaryDto | null> {
  const ls = await account.db.loggedSession.findUnique({
    where: { id: loggedSessionId },
    select: {
      id: true,
      scheduledFor: true,
      mesocycle: { select: { startDate: true, deloadEveryWeeks: true } },
      loggedExercises: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          exercise: { select: { id: true, name: true } },
          _count: { select: { sets: true } },
        },
      },
    },
  });
  if (!ls) return null;

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
      const occ = await getOccurrenceProgression(account, le.id);
      return {
        performedExerciseId: le.exercise.id,
        performedExerciseName: le.exercise.name,
        tag: occ?.tag ?? null,
        rirEffect: occ?.rirEffect ?? null,
        suggestion: occ?.suggestion ?? null,
        hasTrend: occ?.hasTrend ?? false,
        recommendation: occ?.recommendation ?? null,
      };
    }),
  );

  return { loggedSessionId: ls.id, scheduledDeloadWeek, exercises };
}
