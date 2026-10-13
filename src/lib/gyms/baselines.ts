import "server-only";
import { Prisma } from "@prisma/client";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { requiresExternalWeight } from "@/lib/exercises/loading-mode";

/**
 * Gym-specific weight baselines (Guided Workout Logging, Resolved Decisions
 * 42–48). A baseline is the current working weight for one gym-variable
 * Exercise at one Gym, keyed `(gymId, exerciseId)` and isolated: a log at Gym A
 * never touches Gym B.
 *
 * It is written ONLY from the logging completion path (applyBaselineOnCompletion,
 * called inside the same transaction as the set write that completes the
 * exercise). It never rewrites a LoggedSet, and editing history never replays it.
 */

type Db = Prisma.TransactionClient;

/**
 * Bucket C tunable product default (NOT PRD-derived). Correct the baseline when
 * the session's median working weight deviates from it by this percentage or
 * more; smaller differences are ordinary training noise. Expected to be
 * re-tuned from lived data (the Architecture Doc's identified top risk).
 */
export const BASELINE_CORRECTION_THRESHOLD_PERCENT = 15;

/** Median of the completed working-set weights. Odd → middle; even → mean of two middle. */
export function medianWeight(weights: Prisma.Decimal[]): Prisma.Decimal {
  const sorted = [...weights].sort((a, b) => a.comparedTo(b));
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid];
  return sorted[mid - 1].plus(sorted[mid]).dividedBy(2);
}

/**
 * Float-safe deviation test: correct iff
 *   |median − baseline| × 100 ≥ baseline × THRESHOLD
 * (all Decimal arithmetic; no floating-point rounding ambiguity).
 */
export function shouldCorrect(
  median: Prisma.Decimal,
  baseline: Prisma.Decimal,
): boolean {
  const deviation = median.minus(baseline).abs().times(100);
  const bar = baseline.times(BASELINE_CORRECTION_THRESHOLD_PERCENT);
  return deviation.greaterThanOrEqualTo(bar);
}

/**
 * Establish or correct the baseline for a completed LoggedExercise, in the
 * caller's transaction. No-op unless the PERFORMED exercise is gym-variable, the
 * workout has a gym, and every planned working set is present. The first
 * collection at a gym ESTABLISHES (never a "correction"); later ones correct
 * only at/above the threshold. Scoped to this (gymId, exerciseId) only.
 */
export async function applyBaselineOnCompletion(
  loggedExerciseId: string,
  tx: Db,
): Promise<void> {
  const le = await tx.loggedExercise.findUniqueOrThrow({
    where: { id: loggedExerciseId },
    include: { exercise: true, sets: true },
  });
  if (!le.gymId) return;
  // Bodyweight exercises carry no external load and are never gym-variable.
  if (!requiresExternalWeight(le.exercise)) return;
  if (!isGymVariable(le.exercise)) return;

  const workingWeights = le.sets
    .filter((s) => s.setNumber >= 1 && s.setNumber <= le.plannedSets)
    .map((s) => s.weightLbs)
    .filter((w): w is Prisma.Decimal => w !== null);
  // Only act once the exercise is complete (all planned working sets present,
  // each with a load — a missing load never feeds a baseline).
  if (workingWeights.length < le.plannedSets) return;

  const median = medianWeight(workingWeights);
  const existing = await tx.gymExerciseBaseline.findUnique({
    where: { gymId_exerciseId: { gymId: le.gymId, exerciseId: le.exerciseId } },
  });

  if (!existing) {
    // First log at this gym establishes the baseline; not a correction.
    await tx.gymExerciseBaseline.create({
      data: { gymId: le.gymId, exerciseId: le.exerciseId, weightLbs: median },
    });
    return;
  }

  if (shouldCorrect(median, existing.weightLbs)) {
    await tx.gymExerciseBaseline.update({
      where: { id: existing.id },
      data: { weightLbs: median },
    });
  }
}
