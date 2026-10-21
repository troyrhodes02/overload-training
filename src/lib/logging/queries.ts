import "server-only";
import { accountToday, type Account } from "@/lib/data/account";
import type { LoggedSessionStatus } from "@prisma/client";
import {
  addDays,
  formatPlanDate,
  formatPlanRange,
  toIsoDate,
} from "@/lib/plan/calendar";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { requiresExternalWeight } from "@/lib/exercises/loading-mode";
import { isScheduledDeloadWeek } from "@/lib/progression/deload";
import { muscleGroupLabel } from "@/lib/exercises/taxonomy";
import { favoriteExerciseIds } from "@/lib/exercises/queries";
import { getCardioWeek, type CardioOccurrenceDto } from "@/lib/cardio/queries";
import { loadScheduleContext } from "./schedule-context";
import {
  effectiveWeekSchedule,
  occurrenceOnDate,
  oldestUnresolvedMissedDay,
  mesocycleWeek,
  type EffectiveOccurrence,
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
  /** Performed/planned exercise identity, so the dashboard can derive its tag (OVE-28). */
  exerciseId: string;
  isGymVariable: boolean;
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
  /** This occurrence's week is a scheduled-deload week (OVE-28; R41). */
  scheduledDeloadWeek: boolean;
  gymName: string | null;
  exercises: DashboardExercisePreview[];
  setsLogged: number;
  /** Today's cardio (Cardio Logging): independent of the lifting state. */
  cardio: CardioOccurrenceDto[];
};

/**
 * The dashboard state. Cardio never changes the kind (Cardio Logging R66): a
 * cardio-only day is still `rest` for lifting, with its cardio alongside, so
 * the lifting state machine and the Goals rules keyed on `kind` are unchanged.
 */
export type DashboardDto =
  | { kind: "no_plan" }
  | { kind: "rest"; week: number; cardio: CardioOccurrenceDto[] }
  | {
      kind: "missed_day";
      today: string;
      missed: MissedDayInfo;
      below: DashboardTodayDto | null;
      cardio: CardioOccurrenceDto[];
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
  /** False for a pure bodyweight exercise: sets are reps only, no weight input. */
  requiresExternalWeight: boolean;
  gymName: string | null;
  plannedSets: number;
  plannedRepRange: { min: number; max: number };
  /**
   * The working weight: the first set's offered weight (Faster Logging UX R6,
   * R9). Gym-scoped for gym-variable exercises; null for bodyweight or when no
   * context exists. Display/prefill only — never written on its own.
   */
  suggestedWeightLbs: number | null;
  /** True when that weight is this gym's GymExerciseBaseline (captioned "working weight", not "last time"; R27). */
  workingWeightFromBaseline: boolean;
  /** The most recent earlier performance in scope (Faster Logging UX R11). */
  previousPerformance: PreviousPerformanceDto | null;
  /** Marked "Didn't do" (or left with no sets when the workout finished). */
  skipped: boolean;
  /** Planned rows 1..plannedSets, then any logged extra sets. */
  sets: {
    setNumber: number;
    /** The LoggedSet's id when saved (in-card correction); null otherwise. */
    loggedSetId: string | null;
    weightLbs: number | null;
    reps: number | null;
    /** Recorded reps in reserve; null when not recorded or not saved (never 0). */
    rir: number | null;
    saved: boolean;
    /** Beyond the plan: recorded, not used by progression. */
    extra: boolean;
  }[];
};

/**
 * What the lifter did the last time they performed this exercise (Faster
 * Logging UX §11.1). Read-only context for the card; never fed to the engine.
 */
export type PreviousPerformanceDto = {
  /** The earlier workout's scheduled date, YYYY-MM-DD. */
  dateIso: string;
  /** True for a gym-variable exercise: only this gym's history counts. */
  gymScoped: boolean;
  /** Set-number order, extras included. Null weight = a bodyweight set. */
  sets: { setNumber: number; weightLbs: number | null; reps: number }[];
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

/** The active mesocycle and its effective-schedule context, or null if none. */
async function activeContext(account: Account): Promise<{
  mesocycleId: string;
  lengthWeeks: number;
  deloadEveryWeeks: number;
  startDate: string;
  ctx: ScheduleContext;
} | null> {
  const meso = await account.db.mesocycle.findFirst({
    where: { status: "active" },
    include: { sessions: true },
  });
  if (!meso || !meso.startDate) return null;
  const startDate = toIsoDate(meso.startDate);
  const ctx = await loadScheduleContext(account.db, {
    id: meso.id,
    startDate: meso.startDate,
    lengthWeeks: meso.lengthWeeks,
    sessions: meso.sessions,
  });
  return {
    mesocycleId: meso.id,
    lengthWeeks: meso.lengthWeeks,
    deloadEveryWeeks: meso.deloadEveryWeeks,
    startDate,
    ctx,
  };
}

async function plannedPreview(
  account: Account,
  sessionId: string,
): Promise<DashboardExercisePreview[]> {
  const slots = await account.db.sessionExercise.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
    include: {
      exercise: { select: { id: true, name: true, equipmentType: true } },
    },
  });
  return slots.map((s) => ({
    name: s.exercise.name,
    scheme: scheme(s.plannedSets, s.targetRepMin, s.targetRepMax),
    done: false,
    exerciseId: s.exercise.id,
    isGymVariable: isGymVariable(s.exercise),
  }));
}

async function loggedPreview(
  account: Account,
  loggedSessionId: string,
): Promise<{
  exercises: DashboardExercisePreview[];
  setsLogged: number;
  gymName: string | null;
}> {
  const les = await account.db.loggedExercise.findMany({
    where: { loggedSessionId },
    orderBy: { position: "asc" },
    include: {
      exercise: { select: { id: true, name: true, equipmentType: true } },
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
      exerciseId: le.exercise.id,
      isGymVariable: isGymVariable(le.exercise),
    };
  });
  return { exercises, setsLogged, gymName: les[0]?.gym?.name ?? null };
}

export async function getTodayDashboard(
  account: Account,
): Promise<DashboardDto> {
  const active = await activeContext(account);
  if (!active) return { kind: "no_plan" };
  const today = accountToday(account);

  const missed = oldestUnresolvedMissedDay(active.ctx, today);
  const occ = occurrenceOnDate(active.ctx, today);

  // Today's cardio: the current week's entries that land on today. Cardio
  // never feeds the missed-day prompt or the lifting state (R35–R39).
  const week = mesocycleWeek(active.startDate, today);
  const [lifting, cardioWeek] = await Promise.all([
    occ ? buildTodayState(account, active, occ, today) : null,
    getCardioWeek(account, active, week, today),
  ]);
  const cardio = cardioWeek.filter((c) => c.dateIso === today);
  const todayState: DashboardTodayDto | null = lifting
    ? { ...lifting, cardio }
    : null;

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
      cardio,
    };
  }

  if (!occ || !todayState) return { kind: "rest", week, cardio };
  return todayState;
}

async function buildTodayState(
  account: Account,
  active: { ctx: ScheduleContext; deloadEveryWeeks: number },
  occ: {
    sessionId: string;
    sessionName: string;
    authoredIso: string;
    loggedStatus: LoggedSessionStatus | null;
  },
  today: string,
): Promise<Omit<DashboardTodayDto, "cardio">> {
  const week = mesocycleWeek(active.ctx.startDate, today);
  const scheduledDeloadWeek = isScheduledDeloadWeek(
    week,
    active.deloadEveryWeeks,
  );
  const logged = await account.db.loggedSession.findUnique({
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
      scheduledDeloadWeek,
      gymName: null,
      exercises: await plannedPreview(account, occ.sessionId),
      setsLogged: 0,
    };
  }

  const { exercises, setsLogged, gymName } = await loggedPreview(
    account,
    logged.id,
  );
  return {
    kind: logged.status === "complete" ? "complete" : "in_progress",
    sessionId: occ.sessionId,
    loggedSessionId: logged.id,
    sessionName: occ.sessionName,
    scheduledFor: occ.authoredIso,
    week,
    scheduledDeloadWeek,
    gymName,
    exercises,
    setsLogged,
  };
}

async function workingWeight(
  account: Account,
  performedExerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
): Promise<{ lbs: number; fromBaseline: boolean } | null> {
  if (gymVariable) {
    // A machine/cable weight belongs to its gym: this gym's baseline, else the
    // latest weight logged at this gym — never another gym's (Faster Logging
    // UX R9; Guided Workout Logging §8; Progressive Overload Engine R14).
    if (!gymId) return null;
    const b = await account.db.gymExerciseBaseline.findUnique({
      where: { gymId_exerciseId: { gymId, exerciseId: performedExerciseId } },
    });
    if (b) return { lbs: Number(b.weightLbs), fromBaseline: true };
  }
  // Latest REAL load only: a bodyweight (NULL) set is never read back as 0.
  // Known limit (OVE-61): "latest" is by creation time and includes extra
  // sets; changing it changes Pitch 5's suggestions, so it is its own ticket.
  const recent = await account.db.loggedSet.findFirst({
    where: {
      loggedExercise: {
        exerciseId: performedExerciseId,
        ...(gymVariable ? { gymId } : {}),
      },
      weightLbs: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { weightLbs: true },
  });
  return recent?.weightLbs != null
    ? { lbs: Number(recent.weightLbs), fromBaseline: false }
    : null;
}

/**
 * The current working-weight context for an exercise — the SINGLE Pitch 4 weight
 * source (gym-variable: the gym's baseline, else the latest weight logged at
 * that gym; otherwise the latest logged weight anywhere; null for a bodyweight
 * exercise's reps-only history). The Progressive Overload Engine reuses this for its +5 Progress and
 * ×0.90 scheduled-deload suggestions, so there is never a second weight authority
 * (Resolved Decisions R29, R34). Returns null when no context exists (R31, R36).
 */
export async function currentWorkingWeightLbs(
  account: Account,
  performedExerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
): Promise<number | null> {
  const w = await workingWeight(
    account,
    performedExerciseId,
    gymId,
    gymVariable,
  );
  return w?.lbs ?? null;
}

/**
 * The most recent earlier LoggedExercise of the PERFORMED exercise with at
 * least one set (Faster Logging UX R11): on or before this workout's date
 * (same date → created earlier), any mesocycle, the current occurrence
 * excluded. A gym-variable exercise looks only at this gym; with no gym there
 * is no machine context at all. Archived exercises and gyms are not filtered.
 */
async function previousPerformance(
  account: Account,
  current: {
    id: string;
    exerciseId: string;
    gymId: string | null;
    gymVariable: boolean;
    scheduledFor: Date;
    createdAt: Date;
  },
): Promise<PreviousPerformanceDto | null> {
  if (current.gymVariable && !current.gymId) return null;
  const prev = await account.db.loggedExercise.findFirst({
    where: {
      exerciseId: current.exerciseId,
      id: { not: current.id },
      sets: { some: {} },
      ...(current.gymVariable ? { gymId: current.gymId } : {}),
      OR: [
        { loggedSession: { scheduledFor: { lt: current.scheduledFor } } },
        {
          loggedSession: { scheduledFor: current.scheduledFor },
          createdAt: { lt: current.createdAt },
        },
      ],
    },
    orderBy: [
      { loggedSession: { scheduledFor: "desc" } },
      { createdAt: "desc" },
    ],
    select: {
      loggedSession: { select: { scheduledFor: true } },
      sets: {
        orderBy: { setNumber: "asc" },
        select: { setNumber: true, weightLbs: true, reps: true },
      },
    },
  });
  if (!prev) return null;
  return {
    dateIso: toIsoDate(prev.loggedSession.scheduledFor),
    gymScoped: current.gymVariable,
    sets: prev.sets.map((s) => ({
      setNumber: s.setNumber,
      weightLbs: s.weightLbs === null ? null : Number(s.weightLbs),
      reps: s.reps,
    })),
  };
}

export async function getWorkout(
  account: Account,
  loggedSessionId: string,
): Promise<WorkoutDto | null> {
  const ls = await account.db.loggedSession.findUnique({
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

  // Each exercise's two context reads run in parallel, and the exercises run
  // in parallel too: this read sits between a confirmed set and the next set
  // taking focus (review of #76).
  const exercises: ExerciseCardDto[] = await Promise.all(
    ls.loggedExercises.map(async (le) => {
      const variable = isGymVariable(le.exercise);
      const externalLoad = requiresExternalWeight(le.exercise);
      const saved = new Map(le.sets.map((s) => [s.setNumber, s]));
      const rows = Array.from({ length: le.plannedSets }, (_, i) => {
        const n = i + 1;
        const s = saved.get(n);
        return {
          setNumber: n,
          loggedSetId: s?.id ?? null,
          weightLbs: s?.weightLbs != null ? Number(s.weightLbs) : null,
          reps: s ? s.reps : null,
          rir: s ? s.rir : null,
          saved: Boolean(s),
          extra: false,
        };
      });
      for (const s of le.sets) {
        if (s.setNumber > le.plannedSets) {
          rows.push({
            setNumber: s.setNumber,
            loggedSetId: s.id,
            weightLbs: s.weightLbs === null ? null : Number(s.weightLbs),
            reps: s.reps,
            rir: s.rir,
            saved: true,
            extra: true,
          });
        }
      }
      const [working, previous] = await Promise.all([
        externalLoad
          ? workingWeight(account, le.exerciseId, le.gymId, variable)
          : null,
        previousPerformance(account, {
          id: le.id,
          exerciseId: le.exerciseId,
          gymId: le.gymId,
          gymVariable: variable,
          scheduledFor: ls.scheduledFor,
          createdAt: le.createdAt,
        }),
      ]);
      return {
        loggedExerciseId: le.id,
        performedExerciseName: le.exercise.name,
        plannedExerciseName: le.plannedExercise.name,
        performedExerciseId: le.exerciseId,
        plannedPrimaryMuscle: le.plannedExercise.primaryMuscle,
        swapped: le.exerciseId !== le.plannedExerciseId,
        performedArchived: le.exercise.deletedAt !== null,
        isGymVariable: variable,
        requiresExternalWeight: externalLoad,
        gymName: variable ? gymName : null,
        plannedSets: le.plannedSets,
        plannedRepRange: { min: le.targetRepMin, max: le.targetRepMax },
        skipped: le.skippedAt !== null,
        suggestedWeightLbs: working?.lbs ?? null,
        workingWeightFromBaseline: working?.fromBaseline ?? false,
        previousPerformance: previous,
        sets: rows,
      };
    }),
  );
  const allComplete =
    ls.loggedExercises.length > 0 &&
    ls.loggedExercises.every(
      (le) =>
        le.exercise.deletedAt === null && le.sets.length >= le.plannedSets,
    );

  return {
    loggedSessionId: ls.id,
    sessionName: ls.session?.name ?? "Workout",
    scheduledFor: toIsoDate(ls.scheduledFor),
    status: ls.status,
    gymName,
    gymLocked,
    isHistoricalDate: toIsoDate(ls.scheduledFor) !== accountToday(account),
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
  account: Account,
  loggedExerciseId: string,
): Promise<SwapContextDto | null> {
  const le = await account.db.loggedExercise.findUnique({
    where: { id: loggedExerciseId },
    include: {
      plannedExercise: { select: { name: true, primaryMuscle: true } },
      sets: { select: { id: true }, take: 1 },
    },
  });
  if (!le) return null;

  const [rows, favorites] = await Promise.all([
    account.db.exercise.findMany({
      where: {
        deletedAt: null,
        primaryMuscle: le.plannedExercise.primaryMuscle,
        id: { not: le.exerciseId },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    favoriteExerciseIds(account),
  ]);
  // The acting account's favorites first (stable: name order within each group).
  const candidates: SwapCandidate[] = rows
    .map((r) => ({ ...r, isFavorite: favorites.has(r.id) }))
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

  return {
    loggedExerciseId: le.id,
    plannedExerciseName: le.plannedExercise.name,
    primaryMuscleLabel: muscleGroupLabel(le.plannedExercise.primaryMuscle),
    swapLocked: le.sets.length > 0,
    candidates,
  };
}

export type WeekDayState =
  "upcoming" | "in_progress" | "complete" | "skipped" | "shifted";

export type WeekDayDto = {
  dateIso: string;
  dayLabel: string;
  sessionName: string;
  state: WeekDayState;
  loggedSessionId: string | null;
};

export type WeekScheduleDto = {
  weekNumber: number;
  lengthWeeks: number;
  rangeLabel: string;
  days: WeekDayDto[];
  /** The week's cardio, placed on effective dates (Cardio Logging). */
  cardio: CardioOccurrenceDto[];
};

function weekDayState(o: EffectiveOccurrence): WeekDayState {
  if (o.resolution === "skipped") return "skipped";
  if (o.resolution === "shifted" || o.dropped) return "shifted";
  if (o.loggedStatus === "complete") return "complete";
  if (o.loggedStatus === "in_progress") return "in_progress";
  return "upcoming";
}

/**
 * Week-at-a-glance (design Screen 7): the active mesocycle's training days for a
 * given week, with their effective-schedule state. Record navigation, not stats.
 */
export async function getWeekSchedule(
  account: Account,
  weekNumber?: number,
): Promise<WeekScheduleDto | null> {
  const active = await activeContext(account);
  if (!active) return null;
  const today = accountToday(account);
  const current = mesocycleWeek(active.startDate, today);
  const week = Math.min(Math.max(weekNumber ?? current, 1), active.lengthWeeks);

  const occ = effectiveWeekSchedule(active.ctx, week);
  const logged = await account.db.loggedSession.findMany({
    where: { mesocycleId: active.mesocycleId },
    select: { id: true, sessionId: true, scheduledFor: true },
  });
  const idByOccurrence = new Map(
    logged
      .filter((l) => l.sessionId !== null)
      .map((l) => [`${l.sessionId}|${toIsoDate(l.scheduledFor)}`, l.id]),
  );

  const weekStart = addDays(active.startDate, (week - 1) * 7);
  const weekEnd = addDays(weekStart, 6);

  const days: WeekDayDto[] = occ.map((o) => {
    const dateIso = o.effectiveIso ?? o.authoredIso;
    return {
      dateIso,
      dayLabel: formatPlanDate(dateIso),
      sessionName: o.sessionName,
      state: weekDayState(o),
      loggedSessionId:
        idByOccurrence.get(`${o.sessionId}|${o.authoredIso}`) ?? null,
    };
  });

  return {
    weekNumber: week,
    lengthWeeks: active.lengthWeeks,
    rangeLabel: formatPlanRange(weekStart, weekEnd),
    days,
    cardio: await getCardioWeek(account, active, week, today),
  };
}

export type LoggedWorkoutDetailDto = {
  loggedSessionId: string;
  sessionName: string;
  dateIso: string;
  dateLabel: string;
  gymName: string | null;
  exercises: {
    performedName: string;
    plannedName: string;
    swapped: boolean;
    archived: boolean;
    /** Didn't do it (no sets). */
    skipped: boolean;
    /** False for a pure bodyweight exercise: corrections edit reps only. */
    requiresExternalWeight: boolean;
    plannedSets: number;
    sets: {
      loggedSetId: string;
      setNumber: number;
      /** Null for a bodyweight (reps-only) set — shown as reps, never "0 lbs". */
      weightLbs: number | null;
      reps: number;
      /** Recorded reps in reserve; null = not recorded (never shown as 0). */
      rir: number | null;
      /** Beyond the plan. */
      extra: boolean;
    }[];
  }[];
};

/**
 * Logged workout detail (design Screen 8). Read-only factual history; archived
 * exercises and gyms still render by name (never "Unknown"). No derived values.
 */
export async function getLoggedWorkoutDetail(
  account: Account,
  loggedSessionId: string,
): Promise<LoggedWorkoutDetailDto | null> {
  const ls = await account.db.loggedSession.findUnique({
    where: { id: loggedSessionId },
    include: {
      session: { select: { name: true } },
      loggedExercises: {
        orderBy: { position: "asc" },
        include: {
          exercise: {
            select: { name: true, deletedAt: true, equipmentType: true },
          },
          plannedExercise: { select: { name: true } },
          gym: { select: { name: true } },
          sets: { orderBy: { setNumber: "asc" } },
        },
      },
    },
  });
  if (!ls) return null;

  return {
    loggedSessionId: ls.id,
    sessionName: ls.session?.name ?? "Workout",
    dateIso: toIsoDate(ls.scheduledFor),
    dateLabel: formatPlanDate(toIsoDate(ls.scheduledFor)),
    gymName: ls.loggedExercises[0]?.gym?.name ?? null,
    exercises: ls.loggedExercises.map((le) => ({
      performedName: le.exercise.name,
      plannedName: le.plannedExercise.name,
      swapped: le.exerciseId !== le.plannedExerciseId,
      archived: le.exercise.deletedAt !== null,
      skipped: le.skippedAt !== null || le.sets.length === 0,
      requiresExternalWeight: requiresExternalWeight(le.exercise),
      plannedSets: le.plannedSets,
      sets: le.sets.map((s) => ({
        loggedSetId: s.id,
        setNumber: s.setNumber,
        weightLbs: s.weightLbs === null ? null : Number(s.weightLbs),
        reps: s.reps,
        rir: s.rir,
        extra: s.setNumber > le.plannedSets,
      })),
    })),
  };
}
