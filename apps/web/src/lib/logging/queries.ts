import "server-only";
import { isUuid } from "@/lib/actions/result";
import { formatRepTarget } from "@overload/shared/plan/rep-target";
import { accountToday, type Account } from "@/lib/data/account";
import type { LoggedSessionStatus } from "@prisma/client";
import {
  addDays,
  formatPlanDate,
  formatPlanRange,
  mesocycleWeekForDate,
  toIsoDate,
} from "@overload/shared/plan/calendar";
import { isGymVariable } from "@overload/shared/exercises/gym-variable";
import { requiresExternalWeight } from "@overload/shared/exercises/loading-mode";
import { isScheduledDeloadWeek } from "@overload/shared/progression/deload";
import { cardWeightContext, type CardHistoryRow } from "./card-context";
import { exerciseHistoryHref } from "@/lib/progression/history-href";
import {
  isMuscleGroup,
  muscleGroupLabel,
} from "@overload/shared/exercises/taxonomy";
import { favoriteExerciseIds } from "@/lib/exercises/queries";
import {
  LEGACY_OPEN_REP_RANGE,
  openEndedSchemeLine,
} from "@overload/shared/logging/wing-it";
import { isShownOpenEnded } from "./wing-it";
import { loggedWorkoutName, planSnapshot } from "./snapshot";
export { loggedWorkoutName, planSnapshot } from "./snapshot";
import { getCardioWeek } from "@/lib/cardio/queries";
import { loadScheduleContext } from "./schedule-context";
import type { UnfinishedWorkoutDto } from "@overload/shared/contracts/views";
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
  ReferencePerformanceDto,
  WeightContext,
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
export async function activeContext(account: Account): Promise<{
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
    const valid = workingSetCount(le.sets, le.plannedSets);
    setsLogged += valid;
    const plan = planSnapshot(le);
    return {
      name: le.exercise.name,
      scheme: plan
        ? scheme(plan.plannedSets, plan.repMin, plan.repMax)
        : openEndedSchemeLine(valid),
      done: plan ? valid >= plan.plannedSets : valid > 0,
      exerciseId: le.exercise.id,
      isGymVariable: isGymVariable(le.exercise),
    };
  });
  return { exercises, setsLogged, gymName: les[0]?.gym?.name ?? null };
}

/**
 * Workouts started on an earlier day (the account's own calendar) and still in
 * progress, newest first (Pitch 21g OVE-228). Any block, active or not: the
 * workout keeps its own date, gym, and sets; resuming it opens it as it is.
 * A workout with no saved set is left out (nothing to resume). Read only,
 * through the account-scoped client.
 */
export async function listUnfinishedWorkouts(
  account: Account,
  today: string = accountToday(account),
  opts: {
    /**
     * Workouts Today already shows as its own day (review of the 21g
     * corrections #1): a shifted occurrence trained today is stored under
     * its authored, earlier date, and must not ALSO read as unfinished.
     */
    excludeIds?: readonly string[];
  } = {},
): Promise<UnfinishedWorkoutDto[]> {
  const excluded = (opts.excludeIds ?? []).filter(Boolean);
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  // Workouts moved across today this week (OVE-240): for these, the day
  // that counts is the day trained (performedOn), not the planned day.
  const crossing = await account.db.scheduleMove.findMany({
    where: {
      OR: [
        { movedTo: { lt: todayDate }, authoredOn: { gte: todayDate } },
        { authoredOn: { lt: todayDate }, movedTo: { gte: todayDate } },
      ],
    },
    select: { sessionId: true, authoredOn: true, movedTo: true },
  });
  const movedEarlier = crossing.filter((m) => m.movedTo < todayDate);
  const movedKey = (sessionId: string | null, d: Date) =>
    `${sessionId}|${toIsoDate(d)}`;
  const moved = new Set(
    crossing.map((m) => movedKey(m.sessionId, m.authoredOn)),
  );
  const sessions = await account.db.loggedSession.findMany({
    where: {
      status: "in_progress",
      // Started on an earlier day: its planned day is past, or it was moved
      // to an earlier day this week ("Train today" / "Swap days", OVE-240)
      // and keeps its later planned date as its identity.
      OR: [
        { scheduledFor: { lt: todayDate } },
        ...movedEarlier.map((m) => ({
          sessionId: m.sessionId,
          scheduledFor: m.authoredOn,
        })),
      ],
      loggedExercises: { some: { sets: { some: {} } } },
      ...(excluded.length > 0 ? { id: { notIn: excluded } } : {}),
    },
    orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      sessionId: true,
      scheduledFor: true,
      performedOn: true,
      session: { select: { name: true } },
      gym: { select: { name: true } },
      loggedExercises: {
        // Position order: the same exercise (and gym) the dashboard shows first.
        orderBy: { position: "asc" },
        select: {
          plannedSets: true,
          gym: { select: { name: true } },
          sets: { select: { setNumber: true } },
        },
      },
    },
  });
  return sessions
    .map((ls) => ({
      ls,
      // A moved workout's day is the day it was trained (OVE-240).
      day: moved.has(movedKey(ls.sessionId, ls.scheduledFor))
        ? toIsoDate(ls.performedOn)
        : toIsoDate(ls.scheduledFor),
    }))
    .filter(({ day }) => day < today)
    .map(({ ls, day }) => ({
      loggedSessionId: ls.id,
      kind: ls.kind,
      sessionName: loggedWorkoutName(ls),
      scheduledFor: day,
      gymName:
        ls.gym?.name ??
        ls.loggedExercises.find((le) => le.gym)?.gym?.name ??
        null,
      setsLogged: ls.loggedExercises.reduce(
        (n, le) => n + workingSetCount(le.sets, le.plannedSets),
        0,
      ),
    }));
}

/**
 * Saved planned (working) sets: setNumber 1..plannedSets. One rule for
 * Today's previews. An open-ended Wing-It exercise (plannedSets NULL) has no
 * extra sets: every saved set counts.
 */
function workingSetCount(
  sets: readonly { setNumber: number }[],
  plannedSets: number | null,
): number {
  return sets.filter(
    (s) =>
      s.setNumber >= 1 && (plannedSets === null || s.setNumber <= plannedSets),
  ).length;
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

/** Whether an occurrence falls in its block's scheduled-deload week. */
function isDeloadOccurrence(
  mesocycle: { startDate: Date | null; deloadEveryWeeks: number } | null,
  dateIso: string,
): boolean {
  if (!mesocycle?.startDate) return false;
  const week =
    mesocycleWeekForDate(toIsoDate(mesocycle.startDate), dateIso) ?? 1;
  return isScheduledDeloadWeek(week, mesocycle.deloadEveryWeeks);
}

/**
 * Every occurrence of the PERFORMED exercise, through the account-scoped
 * client, shaped for the card's weight context (card-context.ts). Archived
 * exercises and gyms are not filtered: history keeps them.
 */
async function loadCardHistory(
  account: Account,
  exerciseId: string,
): Promise<CardHistoryRow[]> {
  // Planned workouts only (Pitch 25 RD-27): a planned card's offer and its
  // reference lines are exactly as before Wing-It workouts existed.
  const les = await account.db.loggedExercise.findMany({
    where: { exerciseId, loggedSession: { kind: "planned" } },
    select: {
      id: true,
      createdAt: true,
      gymId: true,
      plannedSets: true,
      targetRepMin: true,
      targetRepMax: true,
      sets: {
        orderBy: { setNumber: "asc" },
        select: { setNumber: true, weightLbs: true, reps: true },
      },
      loggedSession: {
        select: {
          scheduledFor: true,
          session: { select: { name: true, lineageId: true } },
          mesocycle: { select: { startDate: true, deloadEveryWeeks: true } },
        },
      },
    },
  });
  return les.flatMap((le) => {
    const plan = planSnapshot(le);
    if (!plan) return []; // unreachable: a planned workout keeps its plan
    const dateIso = toIsoDate(le.loggedSession.scheduledFor);
    return {
      id: le.id,
      dateIso,
      createdAtIso: le.createdAt.toISOString(),
      gymId: le.gymId,
      lineageId: le.loggedSession.session?.lineageId ?? null,
      sessionName: le.loggedSession.session?.name ?? null,
      plannedSets: plan.plannedSets,
      repMin: plan.repMin,
      repMax: plan.repMax,
      scheduledDeload: isDeloadOccurrence(le.loggedSession.mesocycle, dateIso),
      sets: le.sets.map((x) => ({
        setNumber: x.setNumber,
        // A pure bodyweight (NULL) set is never read back as 0.
        weightLbs: x.weightLbs === null ? null : Number(x.weightLbs),
        reps: x.reps,
      })),
    };
  });
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
      session: { select: { name: true, lineageId: true } },
      mesocycle: { select: { startDate: true, deloadEveryWeeks: true } },
      gym: { select: { name: true } },
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
  const wingIt = ls.kind === "wing_it";
  const open = ls.status === "in_progress";
  const scheduledForIso = toIsoDate(ls.scheduledFor);
  const scheduledDeloadWeek = isDeloadOccurrence(ls.mesocycle, scheduledForIso);
  // A Wing-It exercise removed from the workout (marked not done with no
  // sets, spec RD-23) is not a card.
  const loggedExercises = wingIt
    ? ls.loggedExercises.filter((le) => isShownOpenEnded(le))
    : ls.loggedExercises;
  // One history read per performed exercise (an exercise appears once per
  // workout, but a swap can repeat one across cards).
  const histories = new Map<string, Promise<CardHistoryRow[]>>();
  const historyOf = (exerciseId: string) => {
    let h = histories.get(exerciseId);
    if (!h) {
      h = loadCardHistory(account, exerciseId);
      histories.set(exerciseId, h);
    }
    return h;
  };

  const totalSets = loggedExercises.reduce((n, le) => n + le.sets.length, 0);
  const gymLocked = totalSets > 0;
  // A Wing-It workout holds its gym on the session (it may have no exercise).
  const gymName = wingIt
    ? (ls.gym?.name ?? null)
    : (ls.loggedExercises[0]?.gym?.name ?? null);

  // Each exercise's two context reads run in parallel, and the exercises run
  // in parallel too: this read sits between a confirmed set and the next set
  // taking focus (review of #76).
  const exercises: ExerciseCardDto[] = await Promise.all(
    loggedExercises.map(async (le) => {
      const variable = isGymVariable(le.exercise);
      const externalLoad = requiresExternalWeight(le.exercise);
      const plan = planSnapshot(le);
      const savedRow = (s: (typeof le.sets)[number], extra: boolean) => ({
        setNumber: s.setNumber,
        loggedSetId: s.id,
        weightLbs: s.weightLbs === null ? null : Number(s.weightLbs),
        reps: s.reps,
        rir: s.rir,
        saved: true,
        extra,
      });
      const openRow = (n: number) => ({
        setNumber: n,
        loggedSetId: null,
        weightLbs: null,
        reps: null,
        rir: null,
        saved: false,
        extra: false,
      });
      let rows: ExerciseCardDto["sets"];
      if (plan) {
        const saved = new Map(le.sets.map((s) => [s.setNumber, s]));
        rows = Array.from({ length: plan.plannedSets }, (_, i) => {
          const s = saved.get(i + 1);
          return s ? savedRow(s, false) : openRow(i + 1);
        });
        for (const s of le.sets) {
          if (s.setNumber > plan.plannedSets) rows.push(savedRow(s, true));
        }
      } else {
        // Open-ended (Pitch 25): the saved sets, then — while the workout is
        // open — one open row for the next set number.
        rows = le.sets.map((s) => savedRow(s, false));
        if (open && !le.skippedAt) rows.push(openRow(le.sets.length + 1));
      }
      const context = plan
        ? // This recurring workout's comparable history only (Prescription-
          // Aware Intelligence §7.2): never another workout's weight, never
          // the gym baseline.
          cardWeightContext(await historyOf(le.exerciseId), {
            id: le.id,
            dateIso: scheduledForIso,
            createdAtIso: le.createdAt.toISOString(),
            exerciseId: le.exerciseId,
            gymId: le.gymId,
            lineageId: ls.session?.lineageId ?? null,
            repMin: plan.repMin,
            repMax: plan.repMax,
            scheduledDeload: scheduledDeloadWeek,
            gymVariable: variable,
            externalLoad,
          })
        : // No recurring workout and no target (RD-26): last time as
          // reference only, never an offered weight.
          await openEndedCardContext(account, {
            id: le.id,
            exerciseId: le.exerciseId,
            dateIso: scheduledForIso,
            createdAtIso: le.createdAt.toISOString(),
            gymId: le.gymId,
            gymVariable: variable,
          });
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
        // Open-ended: the rows sent and the logged-reps limit, only so an
        // installed app that predates Wing-It keeps working (spec §8).
        plannedSets: plan ? plan.plannedSets : rows.length,
        plannedRepRange: plan
          ? { min: plan.repMin, max: plan.repMax }
          : { ...LEGACY_OPEN_REP_RANGE },
        openEnded: !plan,
        skipped: le.skippedAt !== null,
        suggestedWeightLbs: context.suggestedWeightLbs,
        workingWeightFromBaseline: false,
        previousPerformance: context.previousPerformance,
        referencePerformance: context.referencePerformance,
        weightContext: context.weightContext,
        sets: rows,
      };
    }),
  );
  const allComplete =
    loggedExercises.length > 0 &&
    loggedExercises.every((le) => {
      const plan = planSnapshot(le);
      return (
        le.exercise.deletedAt === null &&
        (plan ? le.sets.length >= plan.plannedSets : le.sets.length > 0)
      );
    });

  return {
    loggedSessionId: ls.id,
    kind: ls.kind,
    sessionName: loggedWorkoutName(ls),
    scheduledFor: toIsoDate(ls.scheduledFor),
    status: ls.status,
    gymName,
    gymLocked,
    isHistoricalDate: toIsoDate(ls.scheduledFor) !== accountToday(account),
    scheduledDeloadWeek,
    exercises,
    complete: allComplete && ls.status === "complete",
  };
}

/**
 * An open-ended (Wing-It) card's context (Pitch 25 RD-26): the most recent
 * EARLIER performance of the exercise in any workout — this gym's only for a
 * machine or cable — shown as reference. Nothing is ever offered in the box:
 * a Wing-It workout has no recurring workout whose weight could be trusted.
 */
async function openEndedCardContext(
  account: Account,
  current: {
    id: string;
    exerciseId: string;
    dateIso: string;
    createdAtIso: string;
    gymId: string | null;
    gymVariable: boolean;
  },
): Promise<
  Pick<
    ExerciseCardDto,
    | "suggestedWeightLbs"
    | "previousPerformance"
    | "referencePerformance"
    | "weightContext"
  >
> {
  const none = {
    suggestedWeightLbs: null,
    previousPerformance: null,
    referencePerformance: null,
    weightContext: "none" as const,
  };
  // A machine or cable with no gym has no context at all (Faster Logging R9).
  if (current.gymVariable && !current.gymId) return none;
  const rows = await account.db.loggedExercise.findMany({
    where: {
      exerciseId: current.exerciseId,
      id: { not: current.id },
      sets: { some: {} },
      ...(current.gymVariable ? { gymId: current.gymId } : {}),
    },
    select: {
      createdAt: true,
      plannedSets: true,
      targetRepMin: true,
      targetRepMax: true,
      sets: {
        orderBy: { setNumber: "asc" },
        select: { setNumber: true, weightLbs: true, reps: true },
      },
      loggedSession: {
        select: {
          kind: true,
          scheduledFor: true,
          session: { select: { name: true } },
        },
      },
    },
  });
  const earlier = rows
    .map((r) => ({
      r,
      dateIso: toIsoDate(r.loggedSession.scheduledFor),
      orderKey: r.createdAt.toISOString(),
    }))
    .filter((x) =>
      x.dateIso !== current.dateIso
        ? x.dateIso < current.dateIso
        : x.orderKey < current.createdAtIso,
    )
    .sort((a, b) =>
      a.dateIso !== b.dateIso
        ? a.dateIso < b.dateIso
          ? 1
          : -1
        : a.orderKey < b.orderKey
          ? 1
          : -1,
    );
  const latest = earlier[0];
  if (!latest) return none;
  const plan = planSnapshot(latest.r);
  return {
    suggestedWeightLbs: null,
    previousPerformance: null,
    referencePerformance: {
      dateIso: latest.dateIso,
      gymScoped: current.gymVariable,
      sets: latest.r.sets.map((x) => ({
        setNumber: x.setNumber,
        // A pure bodyweight (NULL) set is never read back as 0.
        weightLbs: x.weightLbs === null ? null : Number(x.weightLbs),
        reps: x.reps,
      })),
      sessionName: loggedWorkoutName(latest.r.loggedSession),
      repRange: plan
        ? { min: plan.repMin, max: plan.repMax }
        : { ...LEGACY_OPEN_REP_RANGE },
      openEnded: !plan,
    },
    weightContext: "reference_only",
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

/** A week's day plus the session it is an occurrence of (Pitch 21h). */
export type WeekDayWithSessionDto = WeekDayDto & { sessionId: string };

/**
 * The week-at-a-glance read, with each day's session id kept (Pitch 21h: the
 * plan week opens a session from a day). getWeekSchedule drops the id, so its
 * output is unchanged.
 */
export async function getWeekScheduleWithSessions(
  account: Account,
  weekNumber?: number,
): Promise<
  | (Omit<WeekScheduleDto, "days"> & {
      days: WeekDayWithSessionDto[];
      /** The block week holding today, clamped into the block. */
      currentWeek: number;
    })
  | null
> {
  const active = await activeContext(account);
  if (!active) return null;
  const today = accountToday(account);
  const current = Math.min(
    Math.max(mesocycleWeek(active.startDate, today), 1),
    active.lengthWeeks,
  );
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

  // In date order: a moved occurrence (OVE-240) sits on its new day.
  const byDay = [...occ].sort((a, b) => {
    const da = a.effectiveIso ?? a.authoredIso;
    const db = b.effectiveIso ?? b.authoredIso;
    return da < db ? -1 : da > db ? 1 : a.authoredIso < b.authoredIso ? -1 : 1;
  });
  const days: WeekDayWithSessionDto[] = byDay.map((o) => {
    const dateIso = o.effectiveIso ?? o.authoredIso;
    return {
      dateIso,
      dayLabel: formatPlanDate(dateIso),
      sessionName: o.sessionName,
      state: weekDayState(o),
      loggedSessionId:
        idByOccurrence.get(`${o.sessionId}|${o.authoredIso}`) ?? null,
      sessionId: o.sessionId,
    };
  });

  return {
    weekNumber: week,
    lengthWeeks: active.lengthWeeks,
    rangeLabel: formatPlanRange(weekStart, weekEnd),
    days,
    cardio: await getCardioWeek(account, active, week, today),
    currentWeek: current,
  };
}

/**
 * Week-at-a-glance (design Screen 7): the active mesocycle's training days for a
 * given week, with their effective-schedule state. Record navigation, not stats.
 */
export async function getWeekSchedule(
  account: Account,
  weekNumber?: number,
): Promise<WeekScheduleDto | null> {
  const full = await getWeekScheduleWithSessions(account, weekNumber);
  if (!full) return null;
  return {
    weekNumber: full.weekNumber,
    lengthWeeks: full.lengthWeeks,
    rangeLabel: full.rangeLabel,
    days: full.days.map(
      ({ dateIso, dayLabel, sessionName, state, loggedSessionId }) => ({
        dateIso,
        dayLabel,
        sessionName,
        state,
        loggedSessionId,
      }),
    ),
    cardio: full.cardio,
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
      gym: { select: { name: true } },
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
  // A workout moved within its week (OVE-240) is dated the day it was
  // trained: its performedOn, which the start path writes for a moved one.
  const move = ls.sessionId
    ? await account.db.scheduleMove.findUnique({
        where: {
          sessionId_authoredOn: {
            sessionId: ls.sessionId,
            authoredOn: ls.scheduledFor,
          },
        },
        select: { id: true },
      })
    : null;
  const dateIso = toIsoDate(move ? ls.performedOn : ls.scheduledFor);
  const wingIt = ls.kind === "wing_it";

  return {
    loggedSessionId: ls.id,
    kind: ls.kind,
    sessionName: loggedWorkoutName(ls),
    dateIso,
    dateLabel: formatPlanDate(dateIso),
    gymName: wingIt
      ? (ls.gym?.name ?? null)
      : (ls.loggedExercises[0]?.gym?.name ?? null),
    // A Wing-It exercise removed (or left untouched at Finish) has no sets
    // and is not part of the record (spec RD-23).
    exercises: (wingIt
      ? ls.loggedExercises.filter((le) => le.sets.length > 0)
      : ls.loggedExercises
    ).map((le) => ({
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
      // Open-ended: the sets logged, so no "x of y planned sets" (spec §8).
      plannedSets: le.plannedSets ?? le.sets.length,
      openEnded: le.plannedSets === null,
      sets: le.sets.map((s) => ({
        loggedSetId: s.id,
        setNumber: s.setNumber,
        weightLbs: s.weightLbs === null ? null : Number(s.weightLbs),
        reps: s.reps,
        rir: s.rir,
        extra: le.plannedSets !== null && s.setNumber > le.plannedSets,
      })),
    })),
  };
}
