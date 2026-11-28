import "server-only";
import { DomainError, isUniqueViolation, isUuid } from "@/lib/actions/result";
import { accountToday, type Account } from "@/lib/data/account";
import type { AccountDb, AccountTx } from "@/lib/data/account-db";
import { lockWorkoutForUpdate } from "@/lib/data/locks";
import { favoriteExerciseIds } from "@/lib/exercises/queries";
import { parseIsoDate, toIsoDate } from "@overload/shared/plan/calendar";
import {
  isMuscleGroup,
  muscleGroupLabel,
} from "@overload/shared/exercises/taxonomy";
import {
  WING_IT_COPY,
  WING_IT_MAX_EXERCISES,
  WING_IT_NAME,
} from "@overload/shared/logging/wing-it";
import type {
  AddExerciseContextDto,
  AddWingItExerciseResponseDto,
  StartWingItResponseDto,
} from "@overload/shared/contracts/logging";
import type {
  WingItSummaryDto,
  WingItTodayDto,
} from "@overload/shared/contracts/views";

/**
 * Wing-It workouts (Pitch 25): a LoggedSession of kind `wing_it`, with no
 * mesocycle and no session, a workout gym on the session row, and exercises
 * the lifter adds while training (no plan snapshot). These functions write
 * LOGGED state only — never a Mesocycle, Session, SessionExercise,
 * MissedDayResolution, or ScheduleMove (RD-4) — and never a LoggedSet: sets
 * go through src/lib/logging/logged-sets.ts exclusively (RD-7).
 *
 * Every function takes the acting Account and runs on its scoped client;
 * another account's workout, gym, or exercise is "not found" (or "isn't
 * available"), exactly like a missing one. Every write takes the workout
 * lock first (OVE-220; tests/unit/workout-lock-guard.test.ts).
 *
 * Nothing here deletes a row. "Remove from workout" is the existing "not
 * done" mark (setExerciseSkipped) on an exercise with no sets; Wing-It reads
 * hide an open-ended exercise that is marked and has no sets (spec RD-23).
 */

type Db = AccountTx;

const NOT_FOUND = "That workout doesn't exist.";
const NOT_WING_IT = "Exercises can be added only to a Wing-It workout.";
const FINISHED = "This workout is already finished.";

/**
 * Start a Wing-It workout at a gym, or resume the open one (an account has at
 * most one: partial unique index, migration 9t). Resuming an open workout
 * that has no set yet moves it to the chosen gym (as the planned start does).
 * Refused with `conflict` while another workout is in progress with saved
 * sets (RD-5, RD-20); `details` names it so the client can offer Resume.
 * Never reads or writes the plan.
 */
export async function startWingItWorkout(
  account: Account,
  input: { gymId: string },
  tx?: Db,
): Promise<StartWingItResponseDto> {
  if (!tx) {
    const run = () =>
      account.db.$transaction((t) => startWingItWorkout(account, input, t));
    try {
      return await run();
    } catch (error) {
      // A concurrent start (a double tap, two tabs, the web and the phone)
      // won the one-open index. Postgres aborted this transaction, so re-run
      // it: it now finds and resumes the winner's workout, like a replay.
      if (isUniqueViolation(error)) return run();
      throw error;
    }
  }

  const open = await tx.loggedSession.findFirst({
    where: { kind: "wing_it", status: "in_progress" },
    select: { id: true },
  });
  if (open) {
    // Serialize with a set being saved (OVE-220): the gym moves only while
    // the workout truly has no set.
    await lockWorkoutForUpdate(account, tx, { loggedSessionId: open.id });
    const setCount = await tx.loggedSet.count({
      where: { loggedExercise: { loggedSessionId: open.id } },
    });
    // With sets saved the gym stays, so the chosen one isn't even read: a
    // start sent from stale data (its gym archived since) still resumes
    // (review #9).
    if (setCount === 0) {
      await requireActiveGym(input.gymId, tx);
      // The workout's gym, on the session and every exercise (no set exists).
      await tx.loggedSession.update({
        where: { id: open.id },
        data: { gymId: input.gymId },
      });
      await tx.loggedExercise.updateMany({
        where: { loggedSessionId: open.id },
        data: { gymId: input.gymId },
      });
    }
    return { loggedSessionId: open.id, resumed: true };
  }

  await requireActiveGym(input.gymId, tx);
  const active = await activeWorkout(tx);
  if (active) {
    throw new DomainError(
      "conflict",
      `Finish ${active.sessionName} first. It's still in progress with sets saved.`,
      {
        loggedSessionId: active.loggedSessionId,
        sessionName: active.sessionName,
      },
    );
  }

  const today = accountToday(account);
  const date = parseIsoDate(today);
  if (!date) throw new DomainError("validation_error", "Invalid date.");
  const created = await tx.loggedSession.create({
    data: {
      userId: account.userId,
      kind: "wing_it",
      gymId: input.gymId,
      // The day it is trained, as a planned workout records its day.
      performedOn: date,
      scheduledFor: date,
      status: "in_progress",
    },
    select: { id: true },
  });
  return { loggedSessionId: created.id, resumed: false };
}

/**
 * Add an exercise to an open Wing-It workout. Any active exercise the account
 * can see (the shared library or its own custom ones). One card per exercise
 * per workout (RD-22): adding one that is already there answers with it, and
 * one removed earlier comes back (its "not done" mark is cleared). So a retry
 * or a second tap never creates a second card.
 */
export async function addWingItExercise(
  account: Account,
  input: { loggedSessionId: string; exerciseId: string },
  tx?: Db,
): Promise<AddWingItExerciseResponseDto> {
  if (!tx)
    return account.db.$transaction((t) => addWingItExercise(account, input, t));

  await lockWorkoutForUpdate(account, tx, {
    loggedSessionId: input.loggedSessionId,
  });
  const ls = isUuid(input.loggedSessionId)
    ? await tx.loggedSession.findUnique({
        where: { id: input.loggedSessionId },
        select: { id: true, kind: true, status: true, gymId: true },
      })
    : null;
  if (!ls) throw new DomainError("not_found", NOT_FOUND);
  if (ls.kind !== "wing_it")
    throw new DomainError("invalid_state_transition", NOT_WING_IT);
  if (ls.status !== "in_progress")
    throw new DomainError("invalid_state_transition", FINISHED);

  const exercise = isUuid(input.exerciseId)
    ? await tx.exercise.findFirst({
        where: { id: input.exerciseId, deletedAt: null },
        select: { id: true },
      })
    : null;
  if (!exercise) {
    throw new DomainError(
      "validation_error",
      "That exercise isn't available.",
      {
        exerciseId: "That exercise isn't available.",
      },
    );
  }

  const existing = await tx.loggedExercise.findMany({
    where: { loggedSessionId: ls.id },
    select: {
      id: true,
      exerciseId: true,
      position: true,
      skippedAt: true,
      sets: { select: { id: true }, take: 1 },
    },
  });
  const same = existing.find((e) => e.exerciseId === exercise.id);
  if (same) {
    const hidden = same.skippedAt !== null && same.sets.length === 0;
    if (hidden) {
      await tx.loggedExercise.update({
        where: { id: same.id },
        data: { skippedAt: null },
      });
    }
    return {
      loggedExerciseId: same.id,
      exerciseId: exercise.id,
      added: hidden,
    };
  }
  // Only the cards the workout shows count: a removed one (marked not done,
  // nothing saved) can come back but takes no place (review #3).
  if (
    existing.filter((e) => isShownOpenEnded(e)).length >= WING_IT_MAX_EXERCISES
  ) {
    throw new DomainError(
      "validation_error",
      `A Wing-It workout holds up to ${WING_IT_MAX_EXERCISES} exercises.`,
    );
  }
  const position = existing.reduce((m, e) => Math.max(m, e.position), -1) + 1;
  const created = await tx.loggedExercise.create({
    data: {
      userId: account.userId,
      loggedSessionId: ls.id,
      exerciseId: exercise.id,
      // No plan: the chosen exercise is what was intended (RD-19).
      plannedExerciseId: exercise.id,
      gymId: ls.gymId,
      position,
      plannedSets: null,
      targetRepMin: null,
      targetRepMax: null,
    },
    select: { id: true },
  });
  return { loggedExerciseId: created.id, exerciseId: exercise.id, added: true };
}

/**
 * The Add exercise picker's list: every active exercise the account can see,
 * one muscle group or all of them (the default), favorites first, each marked
 * when it is already in this workout. Read only. Null for a workout that is
 * not this account's open Wing-It workout's (or doesn't exist).
 */
export async function getAddExerciseContext(
  account: Account,
  loggedSessionId: string,
  muscle?: string | null,
): Promise<AddExerciseContextDto | null> {
  if (!isUuid(loggedSessionId)) return null;
  const ls = await account.db.loggedSession.findUnique({
    where: { id: loggedSessionId },
    select: {
      id: true,
      kind: true,
      status: true,
      loggedExercises: {
        select: {
          exerciseId: true,
          skippedAt: true,
          sets: { select: { id: true }, take: 1 },
        },
      },
    },
  });
  // Only an open Wing-It workout takes exercises (review #2): a finished one
  // is a record, corrected from History.
  if (!ls || ls.kind !== "wing_it" || ls.status !== "in_progress") return null;
  const selected = isMuscleGroup(muscle) ? muscle : "all";
  const [rows, favorites] = await Promise.all([
    account.db.exercise.findMany({
      where: {
        deletedAt: null,
        ...(selected === "all" ? {} : { primaryMuscle: selected }),
      },
      select: { id: true, name: true, primaryMuscle: true },
      orderBy: { name: "asc" },
    }),
    favoriteExerciseIds(account),
  ]);
  const inWorkout = new Set(
    ls.loggedExercises
      .filter((e) => isShownOpenEnded(e))
      .map((e) => e.exerciseId),
  );
  return {
    loggedSessionId: ls.id,
    selectedMuscle: selected,
    selectedMuscleLabel:
      selected === "all" ? WING_IT_COPY.allMuscles : muscleGroupLabel(selected),
    candidates: rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        primaryMuscle: r.primaryMuscle,
        isFavorite: favorites.has(r.id),
        inWorkout: inWorkout.has(r.id),
      }))
      // Favorites first, name order within each group (the swap picker's).
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)),
  };
}

/**
 * Today's Wing-It section (Pitch 25 design §6.5): the open Wing-It workout,
 * those finished today, and — with none open — the workout in progress with
 * saved sets that must be finished or resumed first. Read only.
 */
export async function getWingItToday(
  account: Account,
): Promise<WingItTodayDto> {
  const today = accountToday(account);
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const rows = await account.db.loggedSession.findMany({
    where: {
      kind: "wing_it",
      OR: [
        { status: "in_progress" },
        { status: "complete", scheduledFor: todayDate },
      ],
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      scheduledFor: true,
      gym: { select: { name: true } },
      loggedExercises: {
        select: { skippedAt: true, sets: { select: { id: true } } },
      },
    },
  });
  const summary = (r: (typeof rows)[number]): WingItSummaryDto => {
    const shown = r.loggedExercises.filter((e) => isShownOpenEnded(e));
    return {
      loggedSessionId: r.id,
      gymName: r.gym?.name ?? null,
      // Every visible card (after Finish, exactly those with sets).
      exerciseCount: shown.length,
      setsLogged: shown.reduce((n, e) => n + e.sets.length, 0),
      startedOn: toIsoDate(r.scheduledFor),
    };
  };
  const openRow = rows.find((r) => r.status === "in_progress") ?? null;
  const open = openRow ? summary(openRow) : null;
  // With a Wing-It workout open, a start resumes it: nothing blocks.
  const blockedBy = open ? null : await activeWorkout(account.db);
  return {
    open,
    finishedToday: rows.filter((r) => r.status === "complete").map(summary),
    blockedBy,
  };
}

/**
 * An open-ended exercise is shown unless it was removed (or left untouched at
 * Finish): marked not done with no sets (spec RD-23). One rule for every read.
 */
export function isShownOpenEnded(e: {
  skippedAt: Date | null;
  sets: readonly unknown[];
}): boolean {
  return e.sets.length > 0 || e.skippedAt === null;
}

/**
 * The newest workout in progress with at least one saved set — the "active"
 * workout (RD-20; the unfinished list's definition) — or null.
 */
async function activeWorkout(
  db: Db | AccountDb,
): Promise<{ loggedSessionId: string; sessionName: string } | null> {
  const row = await db.loggedSession.findFirst({
    where: {
      status: "in_progress",
      loggedExercises: { some: { sets: { some: {} } } },
    },
    orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
    select: { id: true, kind: true, session: { select: { name: true } } },
  });
  if (!row) return null;
  return {
    loggedSessionId: row.id,
    sessionName:
      row.kind === "wing_it" ? WING_IT_NAME : (row.session?.name ?? "Workout"),
  };
}

async function requireActiveGym(gymId: string, tx: Db): Promise<void> {
  if (!isUuid(gymId)) {
    throw new DomainError("validation_error", "Choose an active gym.", {
      gymId: "Choose a gym.",
    });
  }
  const gym = await tx.gym.findFirst({
    where: { id: gymId, deletedAt: null },
    select: { id: true },
  });
  if (!gym) {
    throw new DomainError("validation_error", "Choose an active gym.", {
      gymId: "That gym isn't available.",
    });
  }
}
