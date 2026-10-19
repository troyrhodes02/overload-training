import "server-only";
import { DomainError, isUuid } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import { parseIsoDate } from "@/lib/plan/calendar";

/**
 * LoggedSession lifecycle for Guided Workout Logging. These functions create and
 * mutate LOGGED state only — they never write a Session or SessionExercise
 * (Resolved Decisions 1, 6, 26). LoggedSet writes go through
 * src/lib/logging/logged-sets.ts exclusively.
 *
 * Multi-User Foundation: every function takes the acting Account and runs on
 * its scoped client; another account's session, workout, gym, or exercise is
 * "not found" (or "isn't available"), exactly like a missing one.
 */

type Db = AccountTx;

/**
 * Start a workout for a planned occurrence, or resume the existing one
 * (idempotent on (sessionId, scheduledFor); Decision 2). On first start it
 * snapshots each SessionExercise into a LoggedExercise (plan context preserved;
 * performed exercise starts equal to the planned one). Resuming never duplicates;
 * if no set has been logged yet it may still (re)attach the chosen gym.
 */
export async function startOrResumeWorkout(
  account: Account,
  input: { sessionId: string; scheduledFor: string; gymId: string },
  tx?: Db,
): Promise<{ loggedSessionId: string }> {
  if (!tx)
    return account.db.$transaction((t) =>
      startOrResumeWorkout(account, input, t),
    );

  const date = parseIsoDate(input.scheduledFor);
  if (!date) throw new DomainError("validation_error", "Invalid date.");
  await requireActiveGym(input.gymId, tx);

  const session = await tx.session.findUnique({
    where: { id: input.sessionId },
    include: {
      sessionExercises: { orderBy: { position: "asc" } },
    },
  });
  if (!session)
    throw new DomainError("not_found", "That session doesn't exist.");

  const existing = await tx.loggedSession.findUnique({
    where: {
      sessionId_scheduledFor: {
        sessionId: input.sessionId,
        scheduledFor: date,
      },
    },
    select: { id: true },
  });
  if (existing) {
    const setCount = await tx.loggedSet.count({
      where: { loggedExercise: { loggedSessionId: existing.id } },
    });
    if (setCount === 0) {
      // Gym is still correctable before any set exists (Decision 5).
      await tx.loggedExercise.updateMany({
        where: { loggedSessionId: existing.id },
        data: { gymId: input.gymId },
      });
    }
    return { loggedSessionId: existing.id };
  }

  const ls = await tx.loggedSession.create({
    data: {
      userId: account.userId,
      mesocycleId: session.mesocycleId,
      sessionId: session.id,
      performedOn: date,
      scheduledFor: date,
      status: "in_progress",
    },
    select: { id: true },
  });
  // Written explicitly (not as a nested create) so each row is stamped with
  // its owner by the scoped client (Multi-User Foundation R6).
  if (session.sessionExercises.length > 0) {
    await tx.loggedExercise.createMany({
      data: session.sessionExercises.map((se) => ({
        userId: account.userId,
        loggedSessionId: ls.id,
        exerciseId: se.exerciseId, // performed starts equal to planned
        plannedExerciseId: se.exerciseId,
        sessionExerciseId: se.id,
        gymId: input.gymId,
        position: se.position,
        plannedSets: se.plannedSets,
        targetRepMin: se.targetRepMin,
        targetRepMax: se.targetRepMax,
      })),
    });
  }
  return { loggedSessionId: ls.id };
}

/** Change the workout gym — only while no set exists (Decision 5). */
export async function changeGym(
  account: Account,
  input: { loggedSessionId: string; gymId: string },
  tx?: Db,
): Promise<void> {
  if (!tx)
    return void (await account.db.$transaction((t) =>
      changeGym(account, input, t),
    ));
  const workout = isUuid(input.loggedSessionId)
    ? await tx.loggedSession.findUnique({
        where: { id: input.loggedSessionId },
        select: { id: true },
      })
    : null;
  if (!workout)
    throw new DomainError("not_found", "That workout doesn't exist.");
  const setCount = await tx.loggedSet.count({
    where: { loggedExercise: { loggedSessionId: input.loggedSessionId } },
  });
  if (setCount > 0) {
    throw new DomainError(
      "invalid_state_transition",
      "The gym is locked once sets are logged.",
    );
  }
  await requireActiveGym(input.gymId, tx);
  await tx.loggedExercise.updateMany({
    where: { loggedSessionId: input.loggedSessionId },
    data: { gymId: input.gymId },
  });
}

/**
 * Swap the performed exercise for one LoggedExercise occurrence (Decisions
 * 25–27). Allowed only before the first set; candidate must be active and share
 * the PLANNED exercise's primary muscle. Updates exerciseId (performed) only —
 * never plannedExerciseId, Session, or SessionExercise.
 */
export async function swapExercise(
  account: Account,
  input: { loggedExerciseId: string; newExerciseId: string },
  tx?: Db,
): Promise<void> {
  if (!tx)
    return void (await account.db.$transaction((t) =>
      swapExercise(account, input, t),
    ));

  const le = await tx.loggedExercise.findUnique({
    where: { id: input.loggedExerciseId },
    include: {
      plannedExercise: { select: { primaryMuscle: true } },
      sets: { select: { id: true }, take: 1 },
    },
  });
  if (!le)
    throw new DomainError(
      "not_found",
      "That exercise isn't part of this workout.",
    );
  if (le.sets.length > 0) {
    throw new DomainError(
      "invalid_state_transition",
      "Sets are logged — this exercise is locked.",
    );
  }
  if (!isUuid(input.newExerciseId)) {
    throw new DomainError("validation_error", "That exercise isn't available.");
  }
  const candidate = await tx.exercise.findFirst({
    where: { id: input.newExerciseId, deletedAt: null },
    select: { id: true, primaryMuscle: true },
  });
  if (!candidate) {
    throw new DomainError("validation_error", "That exercise isn't available.");
  }
  if (candidate.primaryMuscle !== le.plannedExercise.primaryMuscle) {
    throw new DomainError(
      "validation_error",
      "Pick an exercise for the same muscle group.",
    );
  }
  await tx.loggedExercise.update({
    where: { id: le.id },
    // Swapping in a substitute means the lifter is doing it: clear "not done".
    data: { exerciseId: candidate.id, skippedAt: null },
  });
}

/**
 * Mark a planned exercise as not done ("Didn't do"), or undo that, while the
 * workout is in progress. Only an exercise with NO sets logged can be marked —
 * a logged set is never hidden or discarded. Records a fact; touches no set,
 * plan, baseline, or goal.
 */
export async function setExerciseSkipped(
  account: Account,
  input: { loggedExerciseId: string; skipped: boolean },
  tx?: Db,
): Promise<void> {
  if (!tx)
    return void (await account.db.$transaction((t) =>
      setExerciseSkipped(account, input, t),
    ));

  const le = isUuid(input.loggedExerciseId)
    ? await tx.loggedExercise.findUnique({
        where: { id: input.loggedExerciseId },
        include: {
          loggedSession: { select: { status: true } },
          sets: { select: { id: true }, take: 1 },
        },
      })
    : null;
  if (!le) {
    throw new DomainError(
      "not_found",
      "That exercise isn't part of this workout.",
    );
  }
  if (le.loggedSession.status !== "in_progress") {
    throw new DomainError(
      "invalid_state_transition",
      "This workout is already finished.",
    );
  }
  if (input.skipped && le.sets.length > 0) {
    throw new DomainError(
      "invalid_state_transition",
      "Sets are logged for this exercise, so it can't be marked as not done.",
    );
  }
  await tx.loggedExercise.update({
    where: { id: le.id },
    data: { skippedAt: input.skipped ? new Date() : null },
  });
}

/**
 * Mark a workout complete (Decisions 16–18, amended). Atomic and explicit;
 * never inferred. The lifter may finish without doing every planned set: the
 * workout needs at least one logged set, any exercise left with no sets is
 * recorded as not done (skippedAt), and a partly logged exercise stays as
 * logged. Incomplete exercises never count toward progression, goals, or gym
 * baselines — those read only exercises with every planned working set — so
 * finishing early can't distort a call.
 */
export async function completeWorkout(
  account: Account,
  input: { loggedSessionId: string },
  tx?: Db,
): Promise<void> {
  if (!tx)
    return void (await account.db.$transaction((t) =>
      completeWorkout(account, input, t),
    ));

  const ls = await tx.loggedSession.findUnique({
    where: { id: input.loggedSessionId },
    include: {
      loggedExercises: { include: { sets: { select: { id: true } } } },
    },
  });
  if (!ls) throw new DomainError("not_found", "That workout doesn't exist.");

  const anySet = ls.loggedExercises.some((le) => le.sets.length > 0);
  if (!anySet) {
    throw new DomainError(
      "validation_error",
      "Log at least one set before finishing.",
    );
  }

  const now = new Date();
  const untouched = ls.loggedExercises
    .filter((le) => le.sets.length === 0 && le.skippedAt === null)
    .map((le) => le.id);
  if (untouched.length > 0) {
    await tx.loggedExercise.updateMany({
      where: { id: { in: untouched } },
      data: { skippedAt: now },
    });
  }

  await tx.loggedSession.update({
    where: { id: ls.id },
    data: { status: "complete", completedAt: now },
  });
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
