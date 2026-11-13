import "server-only";
import { isUuid } from "@/lib/actions/result";
import { formatRepTarget } from "@overload/shared/plan/rep-target";
import { accountToday, type Account } from "@/lib/data/account";
import type { LoggedSessionStatus } from "@prisma/client";
import {
  addDays,
  formatPlanDate,
  formatPlanRange,
  toIsoDate,
} from "@overload/shared/plan/calendar";
import { isGymVariable } from "@overload/shared/exercises/gym-variable";
import { requiresExternalWeight } from "@overload/shared/exercises/loading-mode";
import { isScheduledDeloadWeek } from "@overload/shared/progression/deload";
import { exerciseHistoryHref } from "@/lib/progression/history-href";
import {
  isMuscleGroup,
  muscleGroupLabel,
} from "@overload/shared/exercises/taxonomy";
import { favoriteExerciseIds } from "@/lib/exercises/queries";
import { getCardioWeek } from "@/lib/cardio/queries";
import { loadScheduleContext } from "./schedule-context";
import {
  effectiveWeekSchedule,
  occurrenceOnDate,
  oldestUnresolvedMissedDay,
  mesocycleWeek,
  type EffectiveOccurrence,
  type ScheduleContext,
} from "@overload/shared/logging/schedule";
import type {
  DashboardExercisePreview,
  DashboardTodayDto,
  DashboardDto,
  ExerciseCardDto,
  PreviousPerformanceDto,
  WorkoutDto,
  SwapCandidate,
  SwapContextDto,
  WeekDayState,
  WeekDayDto,
  WeekScheduleDto,
  LoggedWorkoutDetailDto,
} from "@overload/shared/contracts/logging";
export type {
  DashboardExercisePreview,
  MissedDayInfo,
  DashboardTodayDto,
  DashboardDto,
  ExerciseCardDto,
  PreviousPerformanceDto,
  WorkoutDto,
  SwapCandidate,
  SwapContextDto,
  WeekDayState,
  WeekDayDto,
  WeekScheduleDto,
  LoggedWorkoutDetailDto,
} from "@overload/shared/contracts/logging";

/**
 * Server-side reads for Guided Workout Logging. All reads go through Prisma on
 * the server; the client never queries the database. Nothing here is derived
 * progression state — only facts and the effective-schedule view.
 */

function scheme(sets: number, min: number, max: number): string {
  return `${sets} × ${formatRepTarget(min, max)}`;
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
  const ctx = await loadScheduleContext(
    account.db,
    {
      id: meso.id,
      startDate: meso.startDate,
      lengthWeeks: meso.lengthWeeks,
      createdAt: meso.createdAt,
      sessions: meso.sessions,
    },
    account.timeZone,
  );
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

/**
 * Options for reading the working weight from a progression surface
 * (Smarter & Explainable Progression R9, R33). Absent, the read is exactly
 * the Pitch 4 source the card's weight offer uses.
 *
 * - `completedOnly`: only sets from completed workouts. A progression call
 *   judges finished history, so its numbers must not move while a workout is
 *   in progress — on the card, its sibling slots, the planned list, or the
 *   exercise page.
 * - `baselineWrittenBefore`: a gym baseline written at or after this instant
 *   (corrected by the in-progress workout itself) is not that workout's
 *   context; the number is withheld rather than replaced.
 */
export type WorkingWeightOptions = {
  completedOnly?: boolean;
  baselineWrittenBefore?: Date;
};

/**
 * The workout whose top set anchors the working weight (OVE-61): the current
 * card's own occurrence excluded, bounded to workouts on or before its date, so
 * a later-dated workout logged out of order (a missed day logged late) never
 * supplies the number — consistent with the card's "Last time" line
 * (`previousPerformance`). Progression surfaces omit it and read the most recent
 * qualifying workout overall; in-progress history is already excluded there by
 * `completedOnly`.
 */
type WorkingWeightBefore = {
  loggedExerciseId: string;
  scheduledFor: Date;
  createdAt: Date;
};

async function workingWeight(
  account: Account,
  performedExerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
  opts: WorkingWeightOptions = {},
  before?: WorkingWeightBefore,
): Promise<{ lbs: number; fromBaseline: boolean } | null> {
  if (gymVariable) {
    // A machine/cable weight belongs to its gym: this gym's baseline, else the
    // latest weight logged at this gym — never another gym's (Faster Logging
    // UX R9; Guided Workout Logging §8; Progressive Overload Engine R14).
    if (!gymId) return null;
    const b = await account.db.gymExerciseBaseline.findUnique({
      where: { gymId_exerciseId: { gymId, exerciseId: performedExerciseId } },
    });
    if (b) {
      if (
        opts.baselineWrittenBefore &&
        b.updatedAt >= opts.baselineWrittenBefore
      ) {
        return null;
      }
      return { lbs: Number(b.weightLbs), fromBaseline: true };
    }
  }
  // The TOP (heaviest) planned working set of the most recent qualifying
  // workout, ordered by workout date then creation (OVE-61): an extra/back-off
  // set (setNumber > plannedSets) is never the working weight, and a later-
  // dated workout logged out of order never supplies it. A pure bodyweight
  // (NULL) set is never read back as 0.
  const le = await account.db.loggedExercise.findFirst({
    where: {
      exerciseId: performedExerciseId,
      sets: { some: { weightLbs: { not: null } } },
      ...(gymVariable ? { gymId } : {}),
      ...(opts.completedOnly
        ? { loggedSession: { status: "complete" as const } }
        : {}),
      ...(before
        ? {
            id: { not: before.loggedExerciseId },
            OR: [
              { loggedSession: { scheduledFor: { lt: before.scheduledFor } } },
              {
                loggedSession: { scheduledFor: before.scheduledFor },
                createdAt: { lt: before.createdAt },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      { loggedSession: { scheduledFor: "desc" } },
      { createdAt: "desc" },
    ],
    select: {
      plannedSets: true,
      sets: { select: { setNumber: true, weightLbs: true } },
    },
  });
  if (!le) return null;
  let top: number | null = null;
  for (const s of le.sets) {
    // Planned working sets only — an extra set never becomes the anchor.
    if (s.setNumber < 1 || s.setNumber > le.plannedSets) continue;
    if (s.weightLbs === null) continue;
    const w = Number(s.weightLbs);
    if (top === null || w > top) top = w;
  }
  return top !== null ? { lbs: top, fromBaseline: false } : null;
}

/**
 * The current working-weight context for an exercise — the SINGLE Pitch 4 weight
 * source (gym-variable: the gym's baseline, else the latest weight logged at
 * that gym; otherwise the latest logged weight anywhere; null for a bodyweight
 * exercise's reps-only history). The Progressive Overload Engine reuses this for its +5 Progress and
 * ×0.90 scheduled-deload suggestions, so there is never a second weight authority
 * (Resolved Decisions R29, R34). Returns null when no context exists (R31, R36).
 * Progression surfaces read it with `WorkingWeightOptions` (above).
 */
export async function currentWorkingWeightLbs(
  account: Account,
  performedExerciseId: string,
  gymId: string | null,
  gymVariable: boolean,
  opts: WorkingWeightOptions = {},
): Promise<number | null> {
  const w = await workingWeight(
    account,
    performedExerciseId,
    gymId,
    gymVariable,
    opts,
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
  // A malformed id is simply not found (OVE-136 / audit F-T10).
  if (!isUuid(loggedSessionId)) return null;
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
          ? workingWeight(
              account,
              le.exerciseId,
              le.gymId,
              variable,
              {},
              {
                loggedExerciseId: le.id,
                scheduledFor: ls.scheduledFor,
                createdAt: le.createdAt,
              },
            )
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

/**
 * Swap candidates (Guided Workout Logging RD 25–29, amended by Workout
 * Logging Refinements RD-6): the account's active exercises (the library plus
 * its own custom ones) whose PRIMARY muscle is the selected group, excluding
 * the one already performed. The picker opens on the planned exercise's
 * primary muscle and can be switched to any canonical group; `muscle` is the
 * requested group, and anything unrecognized falls back to the planned one.
 * Favorites sort first but never gate eligibility. Swap is locked once a set
 * exists on the occurrence.
 */
export async function getSwapContext(
  account: Account,
  loggedExerciseId: string,
  muscle?: string | null,
): Promise<SwapContextDto | null> {
  // A malformed id is simply not found (OVE-136 / audit F-T10).
  if (!isUuid(loggedExerciseId)) return null;
  const le = await account.db.loggedExercise.findUnique({
    where: { id: loggedExerciseId },
    include: {
      plannedExercise: { select: { name: true, primaryMuscle: true } },
      sets: { select: { id: true }, take: 1 },
      loggedSession: { select: { status: true } },
    },
  });
  if (!le) return null;

  const plannedMuscle = le.plannedExercise.primaryMuscle;
  const selectedMuscle = isMuscleGroup(muscle) ? muscle : plannedMuscle;
  const [rows, favorites] = await Promise.all([
    account.db.exercise.findMany({
      where: {
        deletedAt: null,
        primaryMuscle: selectedMuscle,
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
    plannedMuscle,
    primaryMuscleLabel: muscleGroupLabel(plannedMuscle),
    selectedMuscle,
    selectedMuscleLabel: muscleGroupLabel(selectedMuscle),
    // Locked once a set exists, and always on a finished workout (OVE-130).
    swapLocked: le.sets.length > 0 || le.loggedSession.status !== "in_progress",
    candidates,
  };
}

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

/**
 * Logged workout detail (design Screen 8). Read-only factual history; archived
 * exercises and gyms still render by name (never "Unknown"). No derived values.
 */
export async function getLoggedWorkoutDetail(
  account: Account,
  loggedSessionId: string,
): Promise<LoggedWorkoutDetailDto | null> {
  // A malformed id is simply not found (OVE-136 / audit F-T10).
  if (!isUuid(loggedSessionId)) return null;
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
      loggedExerciseId: le.id,
      exerciseId: le.exerciseId,
      historyHref: exerciseHistoryHref(
        le.exerciseId,
        isGymVariable(le.exercise) ? { gymId: le.gymId } : null,
      ),
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
