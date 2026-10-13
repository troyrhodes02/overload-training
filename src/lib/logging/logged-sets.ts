import "server-only";
import { Prisma, type LoggedSet } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";
import { applyBaselineOnCompletion } from "@/lib/gyms/baselines";

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

export type LogSetInput = {
  loggedExerciseId: string;
  setNumber: number;
  weightLbs: number;
  reps: number;
};

export type EditLoggedSetInput = {
  loggedSetId: string;
  weightLbs: number;
  reps: number;
};

/** Both must be positive (Decision 11). Zero/empty/negative is rejected, never stored. */
function validateValues(weightLbs: number, reps: number): void {
  const details: Record<string, string> = {};
  if (
    typeof weightLbs !== "number" ||
    !Number.isFinite(weightLbs) ||
    weightLbs <= 0 ||
    weightLbs > 9999.99
  ) {
    details.weightLbs = "Enter a weight above 0.";
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
  validateValues(input.weightLbs, input.reps);

  const loggedExercise = await tx.loggedExercise.findUnique({
    where: { id: input.loggedExerciseId },
    select: {
      id: true,
      plannedSets: true,
      skippedAt: true,
      sets: { select: { setNumber: true } },
    },
  });
  if (!loggedExercise) {
    throw new DomainError(
      "not_found",
      "That exercise isn't part of this workout.",
    );
  }
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
      existing.weightLbs.equals(new Prisma.Decimal(input.weightLbs)) &&
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
      weightLbs: new Prisma.Decimal(input.weightLbs),
      reps: input.reps,
    },
  });

  // Same transaction: establish/correct the gym baseline if this set completes a
  // gym-variable exercise at a gym (Decisions 18, 46, 57). No-op otherwise.
  await applyBaselineOnCompletion(input.loggedExerciseId, tx);

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
  validateValues(input.weightLbs, input.reps);
  if (!isUuid(input.loggedSetId)) {
    throw new DomainError("not_found", "That set doesn't exist.");
  }
  const existing = await tx.loggedSet.findUnique({
    where: { id: input.loggedSetId },
    select: { id: true },
  });
  if (!existing) {
    throw new DomainError("not_found", "That set doesn't exist.");
  }
  return tx.loggedSet.update({
    where: { id: input.loggedSetId },
    data: { weightLbs: new Prisma.Decimal(input.weightLbs), reps: input.reps },
  });
}
