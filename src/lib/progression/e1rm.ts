/**
 * The ONE canonical estimated-1-rep-max (spec §11a; Resolved Decisions R17, R18,
 * R54). Progression trend, the stall gate, and later Goals (Pitch 6) all import
 * THIS function — there is never a second e1RM formula.
 *
 * Pure module: no Prisma, React, chart, or server-only import, so Goals can
 * reuse it without pulling in the read layer or chart components.
 */

/**
 * Epley estimated one-rep max: `weight × (1 + reps / 30)`.
 * Special case: a single rep returns the weight exactly (R17).
 *
 * Operates on already-validated stored data (Pitch 4 guarantees weight > 0 and
 * reps ≥ 1). Reps far above the expected range still use the same formula; there
 * is deliberately no second branch at higher reps.
 */
export function estimateOneRepMax(weightLbs: number, reps: number): number {
  if (reps === 1) return weightLbs;
  return weightLbs * (1 + reps / 30);
}

/**
 * The sets that carry an external load. A pure bodyweight set (weight NULL) has
 * no load, so it never enters the Epley formula — not as 0, not as a guessed
 * bodyweight. Callers filter through this before any e1RM call.
 */
export function loadedSets<T extends { weightLbs: number | null }>(
  sets: T[],
): (T & { weightLbs: number })[] {
  return sets.filter(
    (s): s is T & { weightLbs: number } => s.weightLbs !== null,
  );
}

/**
 * The working set with the highest canonical e1RM estimate — the set that
 * defines a performance's session-level e1RM (R18). Ties keep the earlier set.
 * Returns null for an empty list. Goals (Pitch 6) use it to show which set
 * produced a best performance; it is the same "best set" interpretation as
 * sessionE1rm, not a second one.
 */
export function bestWorkingSet<T extends { weightLbs: number; reps: number }>(
  workingSets: T[],
): T | null {
  let best: T | null = null;
  let bestE1rm = 0;
  for (const s of workingSets) {
    const e = estimateOneRepMax(s.weightLbs, s.reps);
    if (best === null || e > bestE1rm) {
      best = s;
      bestE1rm = e;
    }
  }
  return best;
}

/**
 * Session-level e1RM point for one completed performance: the MAXIMUM Epley
 * estimate among its valid working sets (R18). The best working set represents
 * demonstrated strength capacity, so averaging fatigue sets is deliberately
 * avoided. Returns 0 for an empty set list (defensive; callers pass complete
 * performances).
 */
export function sessionE1rm(
  workingSets: { weightLbs: number; reps: number }[],
): number {
  const best = bestWorkingSet(workingSets);
  return best ? Math.max(0, estimateOneRepMax(best.weightLbs, best.reps)) : 0;
}
