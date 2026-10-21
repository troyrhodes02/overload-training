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
import { currentWorkingWeightLbs } from "@/lib/logging/queries";
import { PROGRESS_INCREMENT_LBS } from "./config";
import { isScheduledDeloadWeek, scheduledDeloadLoad } from "./deload";
import {
  evaluateReactiveDecision,
  qualifyingSequence,
  type Performance,
  type ReactiveState,
} from "./engine";
import { bestWorkingSet, loadedSets, sessionE1rm } from "./e1rm";
import type {
  E1rmPointDto,
  ProgressionTag,
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
 */

export type {
  ProgressionTag,
  SuggestedLoadDto,
  E1rmPointDto,
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

async function progressSuggestion(
  account: Account,
  exerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
  externalLoad: boolean,
): Promise<SuggestedLoadDto> {
  // Bodyweight: the lifter decides how to make it harder — never "+5 lb".
  if (!externalLoad) return null;
  const base = await currentWorkingWeightLbs(
    account,
    exerciseId,
    gymId,
    gymVariable,
  );
  if (base == null) return null; // fail safe — never fabricate (R31)
  return { lbs: base + PROGRESS_INCREMENT_LBS, kind: "progress_increment" };
}

async function scheduledDeloadSuggestion(
  account: Account,
  exerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
  externalLoad: boolean,
): Promise<SuggestedLoadDto> {
  // Bodyweight: no load to reduce to 90% of; show the state without a number.
  if (!externalLoad) return null;
  const base = await currentWorkingWeightLbs(
    account,
    exerciseId,
    gymId,
    gymVariable,
  );
  if (base == null) return null; // show state without a number (R36)
  return { lbs: scheduledDeloadLoad(base), kind: "scheduled_deload" };
}

/**
 * Per-exercise progression state + e1RM trend for the detail page. For a
 * gym-variable exercise the active scope is one gym (selected or most-recent);
 * for a gym-consistent exercise it is the global history.
 */
export async function getExerciseProgression(
  account: Account,
  exerciseId: string,
  requestedGymId?: string | null,
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
    const { state, rirEffect } = evaluateReactiveDecision(
      rows.map((r) => r.perf),
      { e1rmApplicable: externalLoad },
    );
    const tag = toTag(state);
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
      tag,
      rirEffect,
      suggestion:
        tag === "progress"
          ? await progressSuggestion(
              account,
              exerciseId,
              null,
              false,
              externalLoad,
            )
          : null,
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
  const { state, rirEffect } = evaluateReactiveDecision(
    scopeRows.map((r) => r.perf),
  );
  const tag = toTag(state);

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
    tag,
    rirEffect,
    suggestion:
      tag === "progress"
        ? await progressSuggestion(
            account,
            exerciseId,
            selectedGymId,
            true,
            true,
          )
        : null,
    currentE1rm: currentE1rm(scopeRows),
    qualifyingCount: qualifyingSequence(scopeRows.map((r) => r.perf)).length,
    points: toPoints(scopeRows, selectedGymName),
  };
}

export type PlannedProgressionDto = {
  tag: ProgressionTag | null;
  /** Carried for consistency; the dashboard planned list shows no reason line (RIR Logging R20). */
  rirEffect: RirEffect;
  gymVariable: boolean;
  suggestion: SuggestedLoadDto;
  hasTrend: boolean;
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
  const base = await getExerciseProgression(account, exerciseId);
  if (!base) {
    return {
      tag: null,
      rirEffect: null,
      gymVariable: false,
      suggestion: null,
      hasTrend: false,
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
    };
  }
  return {
    tag: base.tag,
    rirEffect: base.rirEffect,
    gymVariable: false,
    suggestion: base.suggestion,
    hasTrend,
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
      loggedSession: {
        select: {
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

  const rows = await gatherRows(account, le.exercise.id);
  const scopeRows = gymVariable
    ? rows.filter((r) => r.perf.gymId === le.gymId)
    : rows;
  // A bodyweight exercise has no e1RM trend to link to.
  const hasTrend = externalLoad && scopeRows.some((r) => r.finished);

  if (scheduledDeloadWeek) {
    // Reactive evaluation is suppressed entirely during a scheduled-deload week
    // (R37): no tag, only the reduced-load suggestion.
    return {
      loggedExerciseId,
      scheduledDeloadWeek: true,
      tag: null,
      rirEffect: null,
      suggestion: await scheduledDeloadSuggestion(
        account,
        le.exercise.id,
        le.gymId,
        gymVariable,
        externalLoad,
      ),
      hasTrend,
    };
  }

  const { state, rirEffect } = evaluateReactiveDecision(
    scopeRows.map((r) => r.perf),
    { e1rmApplicable: externalLoad },
  );
  const tag = toTag(state);
  return {
    loggedExerciseId,
    scheduledDeloadWeek: false,
    tag,
    rirEffect,
    suggestion:
      tag === "progress"
        ? await progressSuggestion(
            account,
            le.exercise.id,
            le.gymId,
            gymVariable,
            externalLoad,
          )
        : null,
    hasTrend,
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
      };
    }),
  );

  return { loggedSessionId: ls.id, scheduledDeloadWeek, exercises };
}
