/**
 * Goal progress — pure derivation (Goals spec §11a; R11–R15, R21–R25, R52, R53).
 *
 * Every number here is derived on read from the goal's target and Pitch 5's
 * qualifying performances; nothing is stored. Target and current best both go
 * through the ONE canonical estimator, `estimateOneRepMax` — there is no goal
 * formula. No Prisma, React, or server-only import, so this stays unit-testable
 * and safe for any server caller.
 */
import { estimateOneRepMax } from "@/lib/progression/e1rm";

/**
 * Float tolerance for the reached comparison and percent flooring. The same
 * weight × reps on both sides must always count as reached, and 0.87 must
 * display as 87, not 86 (R52).
 */
export const GOAL_REACHED_EPSILON = 1e-9;

/** A qualifying performance's session e1RM (shape of Pitch 5's QualifyingE1rm). */
export type GoalPerformance = {
  dateIso: string;
  e1rm: number;
  bestSet: { weightLbs: number; reps: number };
};

export type GoalProgress = {
  /** Canonical e1RM of the target weight × reps. */
  targetE1rm: number;
  /** Best qualifying performance in scope; null when none exists. */
  best: {
    e1rm: number;
    weightLbs: number;
    reps: number;
    dateIso: string;
  } | null;
  /** best / target, precise. Null when unmeasured. */
  ratio: number | null;
  /** Floored whole percent capped at 100. Null when unmeasured — never 0 (R23). */
  percent: number | null;
  /** best ≥ target (within ε). Never true without history. */
  reached: boolean;
};

/** Target e1RM: the target weight × reps through the canonical estimator (R12). */
export function goalTargetE1rm(
  targetWeightLbs: number,
  targetReps: number,
): number {
  return estimateOneRepMax(targetWeightLbs, targetReps);
}

/**
 * The best (maximum session e1RM) qualifying performance — best demonstrated,
 * not latest (R14). Ties keep the earliest, when the strength was first shown
 * (R53). Null for no performances.
 */
export function bestPerformance<T extends GoalPerformance>(
  perfs: T[],
): T | null {
  let best: T | null = null;
  for (const p of perfs) {
    if (
      best === null ||
      p.e1rm > best.e1rm ||
      (p.e1rm === best.e1rm && p.dateIso < best.dateIso)
    ) {
      best = p;
    }
  }
  return best;
}

/** Whole percent for display: floored (only a met target reads 100), capped at 100 (R22, R52). */
export function displayPercent(ratio: number): number {
  return Math.min(
    100,
    Math.max(0, Math.floor(ratio * 100 + GOAL_REACHED_EPSILON)),
  );
}

/** Goal progress from the target and its in-scope qualifying performances. */
export function computeGoalProgress(
  target: { targetWeightLbs: number; targetReps: number },
  perfs: GoalPerformance[],
): GoalProgress {
  const targetE1rm = goalTargetE1rm(target.targetWeightLbs, target.targetReps);
  const best = bestPerformance(perfs);
  if (!best) {
    return {
      targetE1rm,
      best: null,
      ratio: null,
      percent: null,
      reached: false,
    };
  }
  const ratio = best.e1rm / targetE1rm;
  return {
    targetE1rm,
    best: {
      e1rm: best.e1rm,
      weightLbs: best.bestSet.weightLbs,
      reps: best.bestSet.reps,
      dateIso: best.dateIso,
    },
    ratio,
    percent: displayPercent(ratio),
    reached: best.e1rm >= targetE1rm - GOAL_REACHED_EPSILON,
  };
}

/** Number without trailing zeros: 315 → "315", 102.5 → "102.5". */
function formatLbs(lbs: number): string {
  return Number.isInteger(lbs) ? String(lbs) : String(Number(lbs.toFixed(2)));
}

/** "315 lb × 1" — the lifter's own target, as typed. */
export function formatGoalTarget(
  targetWeightLbs: number,
  targetReps: number,
): string {
  return `${formatLbs(targetWeightLbs)} lb × ${targetReps}`;
}

/** "315 × 1" — compact form for summary rows. */
export function formatGoalTargetCompact(
  targetWeightLbs: number,
  targetReps: number,
): string {
  return `${formatLbs(targetWeightLbs)} × ${targetReps}`;
}
