import "server-only";
import { Prisma, type LoggedSet } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";
import { applyBaselineOnCompletion } from "@/lib/gyms/baselines";
import { requiresExternalWeight } from "@/lib/exercises/loading-mode";
import type { EquipmentValue } from "@/lib/exercises/taxonomy";

/**
 * The ONLY path that writes a LoggedSet (CLAUDE.md Layer 1; Resolved Decision 9).
 * Nothing else in the application calls prisma.loggedSet.create/update/delete —
 * a static guard test enforces this. LoggedSet deletion does not exist (Decision
 * 52). The set is stored exactly as entered: no tag, no e1RM, no derived value.
 *
 * Every function accepts an optional transaction client so callers can compose;
 * when none is given it opens its own transaction, because a set write and any
 * baseline change it triggers must succeed or fail together (Decision 57).
 */

type Db = Prisma.TransactionClient;

/**
 * `weightLbs` is the external load. A bodyweight exercise (requiresExternalWeight
 * false) logs reps only: omit it or pass null. It is stored as NULL — never 0,
 * never a fake positive number, never a guessed bodyweight.
 */
export type LogSetInput = {
  loggedExerciseId: string;
  setNumber: number;
  weightLbs?: number | null;
  reps: number;
};

export type EditLoggedSetInput = {
  loggedSetId: string;
  weightLbs?: number | null;
  reps: number;
};

/**
 * Validates against the PERFORMED exercise's loading mode (Decision 11, extended
 * for bodyweight). External load: weight > 0 and reps > 0. Bodyweight: reps > 0
 * and no weight at all — a supplied weight (including 0) is rejected rather
 * than silently dropped. Returns the weight to store.
 */
function validateValues(
  exercise: { equipmentType: EquipmentValue },
  weightLbs: number | null | undefined,
  reps: number,
): Prisma.Decimal | null {
  const details: Record<string, string> = {};
  const external = requiresExternalWeight(exercise);
  if (external) {
    if (
      typeof weightLbs !== "number" ||
      !Number.isFinite(weightLbs) ||
      weightLbs <= 0 ||
      weightLbs > 9999.99
    ) {
      details.weightLbs = "Enter a weight above 0.";
    }
  } else if (weightLbs !== null && weightLbs !== undefined) {
    details.weightLbs = "This is a bodyweight exercise — log reps only.";
  }
  if (
    typeof reps !== "number" ||
    !Number.isInteger(reps) ||
    reps <= 0 ||
    reps > 1000
  ) {
    details.reps = "Enter reps above 0.";
  }
  if (Object.keys(details).length > 0) {
    throw new DomainError(
      "validation_error",
      "Check the highlighted fields.",
      details,
    );
  }
  return external ? new Prisma.Decimal(weightLbs as number) : null;
}

function sameWeight(
  stored: Prisma.Decimal | null,
  next: Prisma.Decimal | null,
): boolean {
  if (stored === null || next === null) return stored === next;
  return stored.equals(next);
}

/** At most this many sets beyond the plan in one exercise (input sanity). */
export const MAX_EXTRA_SETS = 10;

/**
 * Planned working sets are 1..plannedSets, in any order. An EXTRA set (one the
 * lifter did beyond the plan) is allowed only once every planned set is
 * logged, and only as the next number in sequence — so extras are always
 * plannedSets+1, +2, … with no gaps. Extras are recorded facts; the
 * progression rule, e1RM, goals, and baselines keep evaluating the planned
 * working sets 1..plannedSets only (the plan's set count stays meaningful).
 * (Amends Guided Workout Logging Decision 12, which allowed no extra sets.)
 */
function isAllowedSetNumber(
  setNumber: number,
  le: { plannedSets: number; sets: { setNumber: number }[] },
): boolean {
  if (!Number.isInteger(setNumber) || setNumber < 1) return false;
  if (setNumber <= le.plannedSets) return true;
  if (setNumber > le.plannedSets + MAX_EXTRA_SETS) return false;
  const logged = new Set(le.sets.map((s) => s.setNumber));
  // Retry of an extra already logged → let the idempotency check decide.
  if (logged.has(setNumber)) return true;
  for (let n = 1; n < setNumber; n++) if (!logged.has(n)) return false;
  return true;
}

export async function logSet(input: LogSetInput, tx?: Db): Promise<LoggedSet> {
  if (!tx) return prisma.$transaction((t) => logSet(input, t));
  return logSetInTx(input, tx);
}

async function logSetInTx(input: LogSetInput, tx: Db): Promise<LoggedSet> {
  const loggedExercise = isUuid(input.loggedExerciseId)
    ? await tx.loggedExercise.findUnique({
        where: { id: input.loggedExerciseId },
        select: {
          id: true,
          plannedSets: true,
          skippedAt: true,
          exercise: { select: { equipmentType: true } },
          sets: { select: { setNumber: true } },
        },
      })
    : null;
  if (!loggedExercise) {
    throw new DomainError(
      "not_found",
      "That exercise isn't part of this workout.",
    );
  }
  // Mode comes from the PERFORMED exercise (swap is locked once a set exists).
  const weight = validateValues(
    loggedExercise.exercise,
    input.weightLbs,
    input.reps,
  );
  if (loggedExercise.skippedAt) {
    throw new DomainError(
      "invalid_state_transition",
      "This exercise is marked as not done. Undo that to log a set.",
    );
  }
  if (!isAllowedSetNumber(input.setNumber, loggedExercise)) {
    throw new DomainError(
      "validation_error",
      "That set isn't part of this exercise.",
      {
        setNumber: "Out of range.",
      },
    );
  }

  // Retry conflict on (loggedExerciseId, setNumber): idempotent if identical,
  // otherwise a conflict — deliberate changes go through editLoggedSet (Decision
  // 14). Checked up front because catching a unique violation would abort the
  // surrounding transaction (Postgres cannot continue an errored transaction).
  const existing = await tx.loggedSet.findUnique({
    where: {
      loggedExerciseId_setNumber: {
        loggedExerciseId: input.loggedExerciseId,
        setNumber: input.setNumber,
      },
    },
  });
  if (existing) {
    if (
      sameWeight(existing.weightLbs, weight) &&
      existing.reps === input.reps
    ) {
      return existing;
    }
    throw new DomainError(
      "conflict",
      "That set is already logged. Edit it from history to change it.",
      { setNumber: "Already logged." },
    );
  }

  const created = await tx.loggedSet.create({
    data: {
      loggedExerciseId: input.loggedExerciseId,
      setNumber: input.setNumber,
      weightLbs: weight,
      reps: input.reps,
    },
  });

  // Same transaction: establish/correct the gym baseline if this set completes a
  // gym-variable exercise at a gym (Decisions 18, 46, 57). No-op otherwise.
  // A bodyweight set has no load to baseline, so it never reaches that path.
  if (weight !== null) {
    await applyBaselineOnCompletion(input.loggedExerciseId, tx);
  }

  return created;
}

/**
 * Correct a historical set's weight/reps (Decision 51). Weight/reps only — never
 * the exercise, gym, set number, or date. No baseline replay (Decisions 53/54):
 * the stored baseline stays the latest value established/corrected by live logging.
 */
export async function editLoggedSet(
  input: EditLoggedSetInput,
  tx?: Db,
): Promise<LoggedSet> {
  if (!tx) return prisma.$transaction((t) => editLoggedSet(input, t));
  if (!isUuid(input.loggedSetId)) {
    throw new DomainError("not_found", "That set doesn't exist.");
  }
  const existing = await tx.loggedSet.findUnique({
    where: { id: input.loggedSetId },
    select: {
      id: true,
      loggedExercise: {
        select: { exercise: { select: { equipmentType: true } } },
      },
    },
  });
  if (!existing) {
    throw new DomainError("not_found", "That set doesn't exist.");
  }
  const weight = validateValues(
    existing.loggedExercise.exercise,
    input.weightLbs,
    input.reps,
  );
  return tx.loggedSet.update({
    where: { id: input.loggedSetId },
    data: { weightLbs: weight, reps: input.reps },
  });
}
