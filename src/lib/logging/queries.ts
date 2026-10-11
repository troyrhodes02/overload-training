import "server-only";
import type { LoggedSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toIsoDate } from "@/lib/plan/calendar";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { muscleGroupLabel } from "@/lib/exercises/taxonomy";
import {
  occurrenceOnDate,
  oldestUnresolvedMissedDay,
  mesocycleWeek,
  type ScheduleContext,
} from "./schedule";

/**
 * Server-side reads for Guided Workout Logging. All reads go through Prisma on
 * the server; the client never queries the database. Nothing here is derived
 * progression state — only facts and the effective-schedule view.
 */

export type DashboardExercisePreview = {
  name: string;
  scheme: string;
  done: boolean;
};

export type MissedDayInfo = {
  mesocycleId: string;
  sessionId: string;
  sessionName: string;
  missedOn: string;
  daysAgo: number;
};

export type DashboardTodayDto = {
  kind: "pending" | "in_progress" | "complete";
  sessionId: string;
  loggedSessionId: string | null;
  sessionName: string;
  scheduledFor: string;
  week: number;
  gymName: string | null;
  exercises: DashboardExercisePreview[];
  setsLogged: number;
};

export type DashboardDto =
  | { kind: "no_plan" }
  | { kind: "rest" }
  | {
      kind: "missed_day";
      today: string;
      missed: MissedDayInfo;
      below: DashboardTodayDto | null;
    }
  | DashboardTodayDto;

export type ExerciseCardDto = {
  loggedExerciseId: string;
  performedExerciseName: string;
  plannedExerciseName: string;
  performedExerciseId: string;
  plannedPrimaryMuscle: string;
  swapped: boolean;
  performedArchived: boolean;
  isGymVariable: boolean;
  gymName: string | null;
  plannedSets: number;
  plannedRepRange: { min: number; max: number };
  suggestedWeightLbs: number | null;
  sets: {
    setNumber: number;
    weightLbs: number | null;
    reps: number | null;
    saved: boolean;
  }[];
};

export type WorkoutDto = {
  loggedSessionId: string;
  sessionName: string;
  scheduledFor: string;
  status: LoggedSessionStatus;
  gymName: string | null;
  gymLocked: boolean;
  isHistoricalDate: boolean;
  exercises: ExerciseCardDto[];
  complete: boolean;
};

function scheme(sets: number, min: number, max: number): string {
  return `${sets} × ${min}–${max}`;
}

function todayIso(): string {
  return toIsoDate(new Date());
}

/** The active mesocycle and its effective-schedule context, or null if none. */
async function activeContext(): Promise<{
  mesocycleId: string;
  lengthWeeks: number;
  startDate: string;
  ctx: ScheduleContext;
} | null> {
  const meso = await prisma.mesocycle.findFirst({
    where: { status: "active" },
    include: { sessions: true },
  });
  if (!meso || !meso.startDate) return null;
  const startDate = toIsoDate(meso.startDate);

  const [resolutions, loggedSessions] = await Promise.all([
    prisma.missedDayResolution.findMany({ where: { mesocycleId: meso.id } }),
    prisma.loggedSession.findMany({ where: { mesocycleId: meso.id } }),
  ]);

  const ctx: ScheduleContext = {
    startDate,
    lengthWeeks: meso.lengthWeeks,
    sessions: meso.sessions
      .filter((s) => s.dayOfWeek !== null)
      .map((s) => ({
        id: s.id,
        name: s.name,
        dayOfWeek: s.dayOfWeek as number,
      })),
    resolutions: resolutions.map((r) => ({
      missedOn: toIsoDate(r.missedOn),
      outcome: r.outcome,
    })),
    loggedSessions: loggedSessions
      .filter((l) => l.sessionId !== null)
      .map((l) => ({
        sessionId: l.sessionId as string,
        scheduledFor: toIsoDate(l.scheduledFor),
        status: l.status,
      })),
  };
  return {
    mesocycleId: meso.id,
    lengthWeeks: meso.lengthWeeks,
    startDate,
    ctx,
  };
}

async function plannedPreview(
  sessionId: string,
): Promise<DashboardExercisePreview[]> {
  const slots = await prisma.sessionExercise.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
    include: { exercise: { select: { name: true } } },
  });
  return slots.map((s) => ({
    name: s.exercise.name,
    scheme: scheme(s.plannedSets, s.targetRepMin, s.targetRepMax),
    done: false,
  }));
}

async function loggedPreview(loggedSessionId: string): Promise<{
  exercises: DashboardExercisePreview[];
  setsLogged: number;
  gymName: string | null;
}> {
  const les = await prisma.loggedExercise.findMany({
    where: { loggedSessionId },
    orderBy: { position: "asc" },
    include: {
      exercise: { select: { name: true } },
      gym: { select: { name: true } },
      sets: { select: { setNumber: true } },
    },
  });
  let setsLogged = 0;
  const exercises = les.map((le) => {
    const valid = le.sets.filter(
      (s) => s.setNumber >= 1 && s.setNumber <= le.plannedSets,
    ).length;
    setsLogged += valid;
    return {
      name: le.exercise.name,
      scheme: scheme(le.plannedSets, le.targetRepMin, le.targetRepMax),
      done: valid >= le.plannedSets,
    };
  });
  return { exercises, setsLogged, gymName: les[0]?.gym?.name ?? null };
}

export async function getTodayDashboard(): Promise<DashboardDto> {
  const active = await activeContext();
  if (!active) return { kind: "no_plan" };
  const today = todayIso();

  const missed = oldestUnresolvedMissedDay(active.ctx, today);
  const occ = occurrenceOnDate(active.ctx, today);

  const todayState = occ ? await buildTodayState(active, occ, today) : null;

  if (missed) {
    const session = active.ctx.sessions.find((s) => s.id === missed.sessionId);
    const daysAgo = Math.max(
      0,
      Math.round(
        (new Date(today).getTime() -
          new Date(missed.effectiveIso ?? missed.authoredIso).getTime()) /
          86_400_000,
      ),
    );
    return {
      kind: "missed_day",
      today,
      missed: {
        mesocycleId: active.mesocycleId,
        sessionId: missed.sessionId,
        sessionName: session?.name ?? "Workout",
        missedOn: missed.authoredIso,
        daysAgo,
      },
      below: todayState,
    };
  }

  if (!occ || !todayState) return { kind: "rest" };
  return todayState;
}

async function buildTodayState(
  active: { ctx: ScheduleContext },
  occ: {
    sessionId: string;
    sessionName: string;
    authoredIso: string;
    loggedStatus: LoggedSessionStatus | null;
  },
  today: string,
): Promise<DashboardTodayDto> {
  const week = mesocycleWeek(active.ctx.startDate, today);
  const logged = await prisma.loggedSession.findUnique({
    where: {
      sessionId_scheduledFor: {
        sessionId: occ.sessionId,
        scheduledFor: new Date(occ.authoredIso),
      },
    },
    select: { id: true, status: true },
  });

  if (!logged) {
    return {
      kind: "pending",
      sessionId: occ.sessionId,
      loggedSessionId: null,
      sessionName: occ.sessionName,
      scheduledFor: occ.authoredIso,
      week,
      gymName: null,
      exercises: await plannedPreview(occ.sessionId),
      setsLogged: 0,
    };
  }

  const { exercises, setsLogged, gymName } = await loggedPreview(logged.id);
  return {
    kind: logged.status === "complete" ? "complete" : "in_progress",
    sessionId: occ.sessionId,
    loggedSessionId: logged.id,
    sessionName: occ.sessionName,
    scheduledFor: occ.authoredIso,
    week,
    gymName,
    exercises,
    setsLogged,
  };
}

async function suggestedWeight(
  performedExerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
): Promise<number | null> {
  if (gymVariable && gymId) {
    const b = await prisma.gymExerciseBaseline.findUnique({
      where: { gymId_exerciseId: { gymId, exerciseId: performedExerciseId } },
    });
    if (b) return Number(b.weightLbs);
  }
  const recent = await prisma.loggedSet.findFirst({
    where: { loggedExercise: { exerciseId: performedExerciseId } },
    orderBy: { createdAt: "desc" },
    select: { weightLbs: true },
  });
  return recent ? Number(recent.weightLbs) : null;
}

export async function getWorkout(
  loggedSessionId: string,
): Promise<WorkoutDto | null> {
  const ls = await prisma.loggedSession.findUnique({
    where: { id: loggedSessionId },
    include: {
      session: { select: { name: true } },
      loggedExercises: {
        orderBy: { position: "asc" },
        include: {
          exercise: {
            select: { name: true, deletedAt: true, equipmentType: true },
          },
          plannedExercise: { select: { name: true, primaryMuscle: true } },
          gym: { select: { name: true } },
          sets: { orderBy: { setNumber: "asc" } },
        },
      },
    },
  });
  if (!ls) return null;

  const totalSets = ls.loggedExercises.reduce((n, le) => n + le.sets.length, 0);
  const gymLocked = totalSets > 0;
  const gymName = ls.loggedExercises[0]?.gym?.name ?? null;

  const exercises: ExerciseCardDto[] = [];
  let allComplete = ls.loggedExercises.length > 0;
  for (const le of ls.loggedExercises) {
    const variable = isGymVariable(le.exercise);
    const saved = new Map(le.sets.map((s) => [s.setNumber, s]));
    const rows = Array.from({ length: le.plannedSets }, (_, i) => {
      const n = i + 1;
      const s = saved.get(n);
      return {
        setNumber: n,
        weightLbs: s ? Number(s.weightLbs) : null,
        reps: s ? s.reps : null,
        saved: Boolean(s),
      };
    });
    const archived = le.exercise.deletedAt !== null;
    const exerciseComplete = !archived && le.sets.length >= le.plannedSets;
    if (!exerciseComplete) allComplete = false;
    exercises.push({
      loggedExerciseId: le.id,
      performedExerciseName: le.exercise.name,
      plannedExerciseName: le.plannedExercise.name,
      performedExerciseId: le.exerciseId,
      plannedPrimaryMuscle: le.plannedExercise.primaryMuscle,
      swapped: le.exerciseId !== le.plannedExerciseId,
      performedArchived: archived,
      isGymVariable: variable,
      gymName: variable ? gymName : null,
      plannedSets: le.plannedSets,
      plannedRepRange: { min: le.targetRepMin, max: le.targetRepMax },
      suggestedWeightLbs: await suggestedWeight(
        le.exerciseId,
        le.gymId,
        variable,
      ),
      sets: rows,
    });
  }

  return {
    loggedSessionId: ls.id,
    sessionName: ls.session?.name ?? "Workout",
    scheduledFor: toIsoDate(ls.scheduledFor),
    status: ls.status,
    gymName,
    gymLocked,
    isHistoricalDate: toIsoDate(ls.scheduledFor) !== todayIso(),
    exercises,
    complete: allComplete && ls.status === "complete",
  };
}

export type SwapCandidate = { id: string; name: string; isFavorite: boolean };

export type SwapContextDto = {
  loggedExerciseId: string;
  plannedExerciseName: string;
  primaryMuscleLabel: string;
  swapLocked: boolean;
  candidates: SwapCandidate[];
};

/**
 * Swap eligibility (Resolved Decisions 25–29): active exercises sharing the
 * PLANNED exercise's primary muscle, excluding the one already performed.
 * Favorites sort first but never gate eligibility. Secondary muscles never
 * qualify. Swap is locked once a set exists on the occurrence.
 */
export async function getSwapContext(
  loggedExerciseId: string,
): Promise<SwapContextDto | null> {
  const le = await prisma.loggedExercise.findUnique({
    where: { id: loggedExerciseId },
    include: {
      plannedExercise: { select: { name: true, primaryMuscle: true } },
      sets: { select: { id: true }, take: 1 },
    },
  });
  if (!le) return null;

  const candidates = await prisma.exercise.findMany({
    where: {
      deletedAt: null,
      primaryMuscle: le.plannedExercise.primaryMuscle,
      id: { not: le.exerciseId },
    },
    select: { id: true, name: true, isFavorite: true },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });

  return {
    loggedExerciseId: le.id,
    plannedExerciseName: le.plannedExercise.name,
    primaryMuscleLabel: muscleGroupLabel(le.plannedExercise.primaryMuscle),
    swapLocked: le.sets.length > 0,
    candidates,
  };
}
