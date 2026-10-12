import "server-only";
import { prisma } from "@/lib/db";
import {
  formatPlanDate,
  mesocycleWeekForDate,
  toIsoDate,
} from "@/lib/plan/calendar";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { currentWorkingWeightLbs } from "@/lib/logging/queries";
import { PROGRESS_INCREMENT_LBS } from "./config";
import { isScheduledDeloadWeek, scheduledDeloadLoad } from "./deload";
import {
  evaluateReactive,
  qualifyingSequence,
  type Performance,
  type ReactiveState,
} from "./engine";
import { sessionE1rm } from "./e1rm";

/**
 * Server-side read layer for the Progressive Overload Engine (spec §11, §11a,
 * §13). It gathers logged history through Prisma, builds pure `Performance`
 * objects, composes the pure engine, and returns the UI DTOs. It performs NO
 * writes and stores nothing: every value here is derived on read (R1, R45).
 *
 * Gym scope (R11–R14, R42): a gym-consistent exercise is evaluated globally; a
 * gym-variable exercise is evaluated within one gym's history only — nominal
 * machine pounds are never compared across gyms.
 */

export type ProgressionTag = "progress" | "deload" | "stalled";

export type SuggestedLoadDto = {
  lbs: number;
  kind: "progress_increment" | "scheduled_deload";
} | null;

export type E1rmPointDto = {
  dateIso: string;
  dateLabel: string;
  e1rm: number;
  scheduledDeload: boolean;
  gymName: string | null;
};

export type ExerciseProgressionDto = {
  exerciseId: string;
  exerciseName: string;
  isGymVariable: boolean;
  isArchived: boolean;
  gyms: { id: string; name: string }[];
  selectedGymId: string | null;
  selectedGymName: string | null;
  state: ReactiveState;
  tag: ProgressionTag | null;
  suggestion: SuggestedLoadDto;
  currentE1rm: number | null;
  qualifyingCount: number;
  points: E1rmPointDto[];
};

export type OccurrenceProgressionDto = {
  loggedExerciseId: string;
  scheduledDeloadWeek: boolean;
  tag: ProgressionTag | null;
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
  gymName: string | null;
  completed: boolean; // session complete AND all planned working sets present
};

/**
 * Gather every performance of the PERFORMED exercise (R10), with its preserved
 * plan context (R8), effective mesocycle week, scheduled-deload flag, gym, and
 * working sets. A performance is `completed` iff its LoggedSession is complete
 * and all planned working sets are present (R9, R44).
 */
async function gatherRows(exerciseId: string): Promise<Row[]> {
  const les = await prisma.loggedExercise.findMany({
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
        weightLbs: Number(s.weightLbs),
        reps: s.reps,
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
      gymName: le.gym?.name ?? null,
      completed,
    };
  });
}

/** Chronological chart points: one per COMPLETED performance (R49), scheduled-
 *  deload points included and marked (R39). */
function toPoints(
  rows: Row[],
  gymNameOverride?: string | null,
): E1rmPointDto[] {
  return rows
    .filter((r) => r.completed && r.perf.workingSets.length > 0)
    .slice()
    .sort((a, b) => (a.perf.dateIso < b.perf.dateIso ? -1 : 1))
    .map((r) => ({
      dateIso: r.perf.dateIso,
      dateLabel: formatPlanDate(r.perf.dateIso),
      e1rm: Math.round(sessionE1rm(r.perf.workingSets)),
      scheduledDeload: r.perf.scheduledDeload,
      gymName: gymNameOverride !== undefined ? gymNameOverride : r.gymName,
    }));
}

/** Most recent NON-deload completed e1RM point in scope (R42); null if none. */
function currentE1rm(rows: Row[]): number | null {
  const pts = rows
    .filter(
      (r) =>
        r.completed && !r.perf.scheduledDeload && r.perf.workingSets.length > 0,
    )
    .sort((a, b) => (a.perf.dateIso < b.perf.dateIso ? -1 : 1));
  const last = pts[pts.length - 1];
  return last ? Math.round(sessionE1rm(last.perf.workingSets)) : null;
}

async function progressSuggestion(
  exerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
): Promise<SuggestedLoadDto> {
  const base = await currentWorkingWeightLbs(exerciseId, gymId, gymVariable);
  if (base == null) return null; // fail safe — never fabricate (R31)
  return { lbs: base + PROGRESS_INCREMENT_LBS, kind: "progress_increment" };
}

async function scheduledDeloadSuggestion(
  exerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
): Promise<SuggestedLoadDto> {
  const base = await currentWorkingWeightLbs(exerciseId, gymId, gymVariable);
  if (base == null) return null; // show state without a number (R36)
  return { lbs: scheduledDeloadLoad(base), kind: "scheduled_deload" };
}

/**
 * Per-exercise progression state + e1RM trend for the detail page. For a
 * gym-variable exercise the active scope is one gym (selected or most-recent);
 * for a gym-consistent exercise it is the global history.
 */
export async function getExerciseProgression(
  exerciseId: string,
  requestedGymId?: string | null,
): Promise<ExerciseProgressionDto | null> {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: { id: true, name: true, equipmentType: true, deletedAt: true },
  });
  if (!exercise) return null;

  const gymVariable = isGymVariable(exercise);
  const rows = await gatherRows(exerciseId);

  if (!gymVariable) {
    const state = evaluateReactive(rows.map((r) => r.perf));
    const tag = toTag(state);
    return {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      isGymVariable: false,
      isArchived: exercise.deletedAt !== null,
      gyms: [],
      selectedGymId: null,
      selectedGymName: null,
      state,
      tag,
      suggestion:
        tag === "progress"
          ? await progressSuggestion(exerciseId, null, false)
          : null,
      currentE1rm: currentE1rm(rows),
      qualifyingCount: qualifyingSequence(rows.map((r) => r.perf)).length,
      points: toPoints(rows, null),
    };
  }

  // Gym-variable: scope to a single gym (R12–R14). List gyms that have at least
  // one completed performance, most-recent first.
  const gymRows = rows.filter((r) => r.completed && r.perf.gymId);
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
  const state = evaluateReactive(scopeRows.map((r) => r.perf));
  const tag = toTag(state);

  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    isGymVariable: true,
    isArchived: exercise.deletedAt !== null,
    gyms,
    selectedGymId,
    selectedGymName,
    state,
    tag,
    suggestion:
      tag === "progress"
        ? await progressSuggestion(exerciseId, selectedGymId, true)
        : null,
    currentE1rm: currentE1rm(scopeRows),
    qualifyingCount: qualifyingSequence(scopeRows.map((r) => r.perf)).length,
    points: toPoints(scopeRows, selectedGymName),
  };
}

/**
 * The reactive call + suggested load for a single planned occurrence (today's
 * card / dashboard). Scheduled-deload weeks suppress all reactive evaluation and
 * show a 90% load instead (R37); otherwise the exercise's history (gym-scoped for
 * gym-variable at this occurrence's gym) decides the tag.
 */
export async function getOccurrenceProgression(
  loggedExerciseId: string,
): Promise<OccurrenceProgressionDto | null> {
  const le = await prisma.loggedExercise.findUnique({
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

  const rows = await gatherRows(le.exercise.id);
  const scopeRows = gymVariable
    ? rows.filter((r) => r.perf.gymId === le.gymId)
    : rows;
  const hasTrend = scopeRows.some((r) => r.completed);

  if (scheduledDeloadWeek) {
    // Reactive evaluation is suppressed entirely during a scheduled-deload week
    // (R37): no tag, only the reduced-load suggestion.
    return {
      loggedExerciseId,
      scheduledDeloadWeek: true,
      tag: null,
      suggestion: await scheduledDeloadSuggestion(
        le.exercise.id,
        le.gymId,
        gymVariable,
      ),
      hasTrend,
    };
  }

  const tag = toTag(evaluateReactive(scopeRows.map((r) => r.perf)));
  return {
    loggedExerciseId,
    scheduledDeloadWeek: false,
    tag,
    suggestion:
      tag === "progress"
        ? await progressSuggestion(le.exercise.id, le.gymId, gymVariable)
        : null,
    hasTrend,
  };
}

/**
 * Per-performed-exercise progression for the completion summary (R52). Reuses
 * the occurrence logic so the summary and the card never disagree.
 */
export async function getSessionProgressionSummary(
  loggedSessionId: string,
): Promise<SessionProgressionSummaryDto | null> {
  const ls = await prisma.loggedSession.findUnique({
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

  const exercises = await Promise.all(
    ls.loggedExercises.map(async (le) => {
      const occ = await getOccurrenceProgression(le.id);
      return {
        performedExerciseId: le.exercise.id,
        performedExerciseName: le.exercise.name,
        tag: occ?.tag ?? null,
        suggestion: occ?.suggestion ?? null,
        hasTrend: occ?.hasTrend ?? false,
      };
    }),
  );

  return { loggedSessionId: ls.id, scheduledDeloadWeek, exercises };
}
