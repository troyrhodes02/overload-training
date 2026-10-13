import "server-only";
import type { Equipment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { lifterTimeZone } from "@/lib/time/lifter-time-zone";
import { isUuid } from "@/lib/actions/result";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { requiresExternalWeight } from "@/lib/exercises/loading-mode";
import { getExercise } from "@/lib/exercises/queries";
import { listActiveGyms } from "@/lib/gyms/queries";
import { formatPlanDate } from "@/lib/plan/calendar";
import {
  getQualifyingSessionE1rms,
  type QualifyingE1rm,
} from "@/lib/progression/queries";
import {
  computeGoalProgress,
  formatGoalTarget,
  formatGoalTargetCompact,
  type GoalProgress,
} from "./progress";

/**
 * Goal reads (Goals spec §13). Every percentage and best value is derived here
 * from Pitch 5's qualifying performances on each read — nothing is stored, so
 * a corrected past set changes the next read with nothing to recompute.
 * Read-only: no write of any kind lives in this module.
 *
 * Archived exercises and gyms are resolved WITHOUT a `deletedAt` filter so a
 * goal's context stays readable after archival (R39–R41).
 */

export type GoalContextDto = {
  goalId: string;
  exerciseId: string;
  exerciseName: string;
  exerciseArchived: boolean;
  gymId: string | null;
  gymName: string | null;
  gymArchived: boolean;
  targetWeightLbs: number;
  targetReps: number;
  /** "315 lb × 1" */
  targetLabel: string;
  createdAtIso: string;
  /** "Sep 2, 2026" */
  createdLabel: string;
};

export type GoalBestDto = {
  e1rm: number;
  weightLbs: number;
  reps: number;
  dateIso: string;
  dateLabel: string;
};

export type ActiveGoalDto = GoalContextDto & {
  /** Floored whole percent ≤ 100; null → "No performance recorded yet". */
  percent: number | null;
  /** Rounded for display. */
  targetE1rm: number;
  best: GoalBestDto | null;
};

export type GoalHistoryDto = GoalContextDto & {
  outcome: "completed" | "manual";
  archivedAtIso: string;
  /** "Oct 12, 2026" */
  archivedLabel: string;
};

export type GoalReachedDto = GoalContextDto & {
  alreadyReached: boolean;
  newGoalHref: string;
};

export type GoalDetailDto =
  | ({ kind: "active" } & ActiveGoalDto)
  | ({
      kind: "archived";
      unacknowledged: boolean;
      alreadyReached: boolean;
      /** Null when the exercise is archived or already has another active goal. */
      newGoalHref: string | null;
    } & GoalHistoryDto);

export type SessionGoalRowDto = {
  goalId: string;
  exerciseName: string;
  /** "315 × 1" */
  targetLabel: string;
  kind: "progress" | "reached";
  /** Null when this was the first measured session (or for "reached"). */
  percentBefore: number | null;
  percentAfter: number | null;
};

export type GoalFormContextDto =
  | {
      kind: "ok";
      exercise: {
        id: string;
        name: string;
        meta: string;
        imageUrl: string | null;
      };
      gymVariable: boolean;
      gyms: { id: string; name: string }[];
      defaultGymId: string | null;
    }
  | { kind: "duplicate"; exerciseName: string; existing: ActiveGoalDto }
  | { kind: "no_gyms"; exerciseName: string; exerciseMeta: string }
  | { kind: "archived_exercise"; exerciseName: string }
  /** A goal is a weight × reps target measured by e1RM; reps-only lifts have neither. */
  | { kind: "bodyweight_unsupported"; exerciseName: string }
  | { kind: "not_found" };

/** Timestamp → "Oct 12, 2026", on the calendar of the lifter's time zone. */
export function formatGoalDate(date: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
}

const goalInclude = {
  exercise: { select: { name: true, equipmentType: true, deletedAt: true } },
  gym: { select: { name: true, deletedAt: true } },
} satisfies Prisma.GoalInclude;

type GoalRow = Prisma.GoalGetPayload<{ include: typeof goalInclude }>;

function toContext(g: GoalRow, tz: string): GoalContextDto {
  const weight = Number(g.targetWeightLbs);
  return {
    goalId: g.id,
    exerciseId: g.exerciseId,
    exerciseName: g.exercise.name,
    exerciseArchived: g.exercise.deletedAt !== null,
    gymId: g.gymId,
    gymName: g.gym?.name ?? null,
    gymArchived: g.gym ? g.gym.deletedAt !== null : false,
    targetWeightLbs: weight,
    targetReps: g.targetReps,
    targetLabel: formatGoalTarget(weight, g.targetReps),
    createdAtIso: g.createdAt.toISOString(),
    createdLabel: formatGoalDate(g.createdAt, tz),
  };
}

/** The fields that decide which history a goal is measured against. */
export type GoalScopeInput = {
  exerciseId: string;
  gymId: string | null;
  exercise: { equipmentType: Equipment };
};

/**
 * The ONE scope rule for goal measurement (R16, R17, R19, R51), shared by the
 * completion engine and every read so they can never disagree: a gym-variable
 * goal is measured at its gym only; a gym-consistent goal across all gyms.
 */
export async function goalPerformances(
  g: GoalScopeInput,
  db?: Prisma.TransactionClient,
): Promise<QualifyingE1rm[]> {
  if (!isGymVariable(g.exercise)) {
    return getQualifyingSessionE1rms(g.exerciseId, null, db);
  }
  // A gym-variable goal without a gym is unmeasurable (never created so).
  if (!g.gymId) return [];
  return getQualifyingSessionE1rms(g.exerciseId, g.gymId, db);
}

const performancesFor = (g: GoalRow) => goalPerformances(g);

function progressOf(g: GoalRow, perfs: QualifyingE1rm[]): GoalProgress {
  return computeGoalProgress(
    { targetWeightLbs: Number(g.targetWeightLbs), targetReps: g.targetReps },
    perfs,
  );
}

function toActive(
  g: GoalRow,
  progress: GoalProgress,
  tz: string,
): ActiveGoalDto {
  return {
    ...toContext(g, tz),
    percent: progress.percent,
    targetE1rm: Math.round(progress.targetE1rm),
    best: progress.best
      ? {
          e1rm: Math.round(progress.best.e1rm),
          weightLbs: progress.best.weightLbs,
          reps: progress.best.reps,
          dateIso: progress.best.dateIso,
          dateLabel: formatPlanDate(progress.best.dateIso),
        }
      : null,
  };
}

async function activeDto(g: GoalRow, tz: string): Promise<ActiveGoalDto> {
  return toActive(g, progressOf(g, await performancesFor(g)), tz);
}

function toHistory(g: GoalRow, tz: string): GoalHistoryDto {
  const archivedAt = g.archivedAt ?? g.updatedAt;
  return {
    ...toContext(g, tz),
    outcome: g.archiveReason === "completed" ? "completed" : "manual",
    archivedAtIso: archivedAt.toISOString(),
    archivedLabel: formatGoalDate(archivedAt, tz),
  };
}

/** Completed at creation: the creation transaction stamps both with one `now` (R57). */
function isAlreadyReached(g: GoalRow): boolean {
  return (
    g.archiveReason === "completed" &&
    g.archivedAt !== null &&
    g.archivedAt.getTime() === g.createdAt.getTime()
  );
}

/** Where "Set a new goal" leads: blank form for the same lift (and gym, if still active). */
function newGoalHrefFor(g: GoalRow): string {
  if (g.exercise.deletedAt) return "/goals/new";
  const gym = g.gymId && g.gym && !g.gym.deletedAt ? `?gymId=${g.gymId}` : "";
  return `/goals/new/${g.exerciseId}${gym}`;
}

/** Active goals, oldest first (stable order the lifter set them in; R64). */
export async function listActiveGoals(opts?: {
  take?: number;
}): Promise<ActiveGoalDto[]> {
  const rows = await prisma.goal.findMany({
    where: { status: "active" },
    include: goalInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    ...(opts?.take ? { take: opts.take } : {}),
  });
  const tz = await lifterTimeZone();
  return Promise.all(rows.map((g) => activeDto(g, tz)));
}

export async function countActiveGoals(): Promise<number> {
  return prisma.goal.count({ where: { status: "active" } });
}

/** Reached and manually archived goals, most recently archived first. */
export async function listGoalHistory(): Promise<GoalHistoryDto[]> {
  const rows = await prisma.goal.findMany({
    where: { status: "archived" },
    include: goalInclude,
    orderBy: [{ archivedAt: "desc" }, { id: "asc" }],
  });
  const tz = await lifterTimeZone();
  return rows.map((g) => toHistory(g, tz));
}

export async function countGoalHistory(): Promise<number> {
  return prisma.goal.count({ where: { status: "archived" } });
}

/** Completed goals whose one-time "Goal reached" card has not been dismissed. */
export async function listUnacknowledgedCompletions(): Promise<
  GoalReachedDto[]
> {
  const rows = await prisma.goal.findMany({
    where: { archiveReason: "completed", completionAcknowledgedAt: null },
    include: goalInclude,
    orderBy: [{ archivedAt: "desc" }, { id: "asc" }],
  });
  const tz = await lifterTimeZone();
  return rows.map((g) => ({
    ...toContext(g, tz),
    alreadyReached: isAlreadyReached(g),
    newGoalHref: newGoalHrefFor(g),
  }));
}

/** exerciseId → its active goal's id (the picker marks these rows). */
export async function activeGoalExerciseMap(): Promise<Map<string, string>> {
  const rows = await prisma.goal.findMany({
    where: { status: "active" },
    select: { id: true, exerciseId: true },
  });
  return new Map(rows.map((r) => [r.exerciseId, r.id]));
}

export async function getGoalDetail(
  goalId: string,
): Promise<GoalDetailDto | null> {
  if (!isUuid(goalId)) return null;
  const g = await prisma.goal.findUnique({
    where: { id: goalId },
    include: goalInclude,
  });
  if (!g) return null;
  const tz = await lifterTimeZone();
  if (g.status === "active")
    return { kind: "active", ...(await activeDto(g, tz)) };

  const otherActive = await prisma.goal.findFirst({
    where: { exerciseId: g.exerciseId, status: "active" },
    select: { id: true },
  });
  return {
    kind: "archived",
    ...toHistory(g, tz),
    unacknowledged:
      g.archiveReason === "completed" && g.completionAcknowledgedAt === null,
    alreadyReached: isAlreadyReached(g),
    newGoalHref: g.exercise.deletedAt || otherActive ? null : newGoalHrefFor(g),
  };
}

/** Everything the target form needs for one exercise (design Screen 3). */
export async function getGoalFormContext(
  exerciseId: string,
  requestedGymId?: string | null,
): Promise<GoalFormContextDto> {
  const exercise = await getExercise(exerciseId);
  if (!exercise) return { kind: "not_found" };
  if (exercise.isArchived) {
    return { kind: "archived_exercise", exerciseName: exercise.name };
  }
  if (!requiresExternalWeight({ equipmentType: exercise.equipmentType })) {
    return { kind: "bodyweight_unsupported", exerciseName: exercise.name };
  }

  const existing = await prisma.goal.findFirst({
    where: { exerciseId: exercise.id, status: "active" },
    include: goalInclude,
  });
  if (existing) {
    return {
      kind: "duplicate",
      exerciseName: exercise.name,
      existing: await activeDto(existing, await lifterTimeZone()),
    };
  }

  const meta = `${exercise.primaryMuscleLabel} · ${exercise.equipmentLabel}`;
  const gymVariable = isGymVariable({ equipmentType: exercise.equipmentType });
  const gyms = gymVariable
    ? (await listActiveGyms()).map((g) => ({ id: g.id, name: g.name }))
    : [];
  if (gymVariable && gyms.length === 0) {
    return { kind: "no_gyms", exerciseName: exercise.name, exerciseMeta: meta };
  }
  const defaultGymId = !gymVariable
    ? null
    : requestedGymId && gyms.some((g) => g.id === requestedGymId)
      ? requestedGymId
      : gyms.length === 1
        ? gyms[0].id
        : null;

  return {
    kind: "ok",
    exercise: {
      id: exercise.id,
      name: exercise.name,
      meta,
      imageUrl: exercise.imageUrl,
    },
    gymVariable,
    gyms,
    defaultGymId,
  };
}

/**
 * Goals a completed workout touched (design Screen 8; spec §13). A goal is
 * touched when this session contributed a qualifying performance in the
 * goal's scope — the PERFORMED exercise (swaps count to what was done) and,
 * for a machine goal, at its gym. Untouched goals never appear.
 */
export async function getSessionGoalSummary(
  loggedSessionId: string,
): Promise<SessionGoalRowDto[]> {
  if (!isUuid(loggedSessionId)) return [];
  const session = await prisma.loggedSession.findUnique({
    where: { id: loggedSessionId },
    select: {
      status: true,
      completedAt: true,
      loggedExercises: { select: { exerciseId: true } },
    },
  });
  if (!session || session.status !== "complete" || !session.completedAt) {
    return [];
  }
  const performed = [
    ...new Set(session.loggedExercises.map((le) => le.exerciseId)),
  ];
  if (performed.length === 0) return [];

  const goals = await prisma.goal.findMany({
    where: {
      exerciseId: { in: performed },
      // Only goals that existed when the workout was completed (R44): a goal
      // set afterwards was not "moved" by this workout.
      createdAt: { lte: session.completedAt },
      OR: [
        { status: "active" },
        {
          archiveReason: "completed",
          archivedAt: { gte: session.completedAt },
        },
      ],
    },
    include: goalInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const rows: SessionGoalRowDto[] = [];
  for (const g of goals) {
    const perfs = await performancesFor(g);
    const fromSession = perfs.filter(
      (p) => p.loggedSessionId === loggedSessionId,
    );
    if (fromSession.length === 0) continue;
    const base = {
      goalId: g.id,
      exerciseName: g.exercise.name,
      targetLabel: formatGoalTargetCompact(
        Number(g.targetWeightLbs),
        g.targetReps,
      ),
    };
    if (g.status === "archived") {
      // Same reached rule as the completion engine (computeGoalProgress).
      if (progressOf(g, fromSession).reached) {
        rows.push({
          ...base,
          kind: "reached",
          percentBefore: null,
          percentAfter: null,
        });
      }
      continue;
    }
    const after = progressOf(g, perfs).percent;
    const before = progressOf(
      g,
      perfs.filter((p) => p.loggedSessionId !== loggedSessionId),
    ).percent;
    rows.push({
      ...base,
      kind: "progress",
      percentBefore: before,
      percentAfter: after,
    });
  }
  return rows;
}
