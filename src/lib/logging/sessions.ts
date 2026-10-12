import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";
import { parseIsoDate } from "@/lib/plan/calendar";

/**
 * LoggedSession lifecycle for Guided Workout Logging. These functions create and
 * mutate LOGGED state only — they never write a Session or SessionExercise
 * (Resolved Decisions 1, 6, 26). LoggedSet writes go through
 * src/lib/logging/logged-sets.ts exclusively.
 */

type Db = Prisma.TransactionClient;

/**
 * Start a workout for a planned occurrence, or resume the existing one
 * (idempotent on (sessionId, scheduledFor); Decision 2). On first start it
 * snapshots each SessionExercise into a LoggedExercise (plan context preserved;
 * performed exercise starts equal to the planned one). Resuming never duplicates;
 * if no set has been logged yet it may still (re)attach the chosen gym.
 */
export async function startOrResumeWorkout(
  input: { sessionId: string; scheduledFor: string; gymId: string },
  tx?: Db,
): Promise<{ loggedSessionId: string }> {
  if (!tx) return prisma.$transaction((t) => startOrResumeWorkout(input, t));

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
      mesocycleId: session.mesocycleId,
      sessionId: session.id,
      performedOn: date,
      scheduledFor: date,
      status: "in_progress",
      loggedExercises: {
        create: session.sessionExercises.map((se) => ({
          exerciseId: se.exerciseId, // performed starts equal to planned
          plannedExerciseId: se.exerciseId,
          sessionExerciseId: se.id,
          gymId: input.gymId,
          position: se.position,
          plannedSets: se.plannedSets,
          targetRepMin: se.targetRepMin,
          targetRepMax: se.targetRepMax,
        })),
      },
    },
    select: { id: true },
  });
  return { loggedSessionId: ls.id };
}

/** Change the workout gym — only while no set exists (Decision 5). */
export async function changeGym(
  input: { loggedSessionId: string; gymId: string },
  tx?: Db,
): Promise<void> {
  if (!tx) return void (await prisma.$transaction((t) => changeGym(input, t)));
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
  input: { loggedExerciseId: string; newExerciseId: string },
  tx?: Db,
): Promise<void> {
  if (!tx)
    return void (await prisma.$transaction((t) => swapExercise(input, t)));

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
    data: { exerciseId: candidate.id },
  });
}

/**
 * Mark a workout complete (Decisions 16–18). Atomic and explicit: it validates
 * that every LoggedExercise has all its planned working sets and no performed
 * exercise is archived, then flips status + completedAt together. Never inferred.
 */
export async function completeWorkout(
  input: { loggedSessionId: string },
  tx?: Db,
): Promise<void> {
  if (!tx)
    return void (await prisma.$transaction((t) => completeWorkout(input, t)));

  const ls = await tx.loggedSession.findUnique({
    where: { id: input.loggedSessionId },
    include: {
      loggedExercises: {
        include: {
          exercise: { select: { name: true, deletedAt: true } },
          sets: true,
        },
      },
    },
  });
  if (!ls) throw new DomainError("not_found", "That workout doesn't exist.");

  const unresolved: string[] = [];
  for (const le of ls.loggedExercises) {
    if (le.exercise.deletedAt !== null) {
      unresolved.push(
        `${le.exercise.name} (unavailable — choose a substitute)`,
      );
      continue;
    }
    const validSets = le.sets.filter(
      (s) => s.setNumber >= 1 && s.setNumber <= le.plannedSets,
    ).length;
    if (validSets < le.plannedSets) unresolved.push(le.exercise.name);
  }
  if (unresolved.length > 0) {
    throw new DomainError("validation_error", "Finish every exercise first.", {
      exercises: unresolved.join(", "),
    });
  }

  await tx.loggedSession.update({
    where: { id: ls.id },
    data: { status: "complete", completedAt: new Date() },
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
