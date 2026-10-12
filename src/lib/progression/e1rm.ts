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
 * Session-level e1RM point for one completed performance: the MAXIMUM Epley
 * estimate among its valid working sets (R18). The best working set represents
 * demonstrated strength capacity, so averaging fatigue sets is deliberately
 * avoided. Returns 0 for an empty set list (defensive; callers pass complete
 * performances).
 */
export function sessionE1rm(
  workingSets: { weightLbs: number; reps: number }[],
): number {
  let max = 0;
  for (const s of workingSets) {
    const e = estimateOneRepMax(s.weightLbs, s.reps);
    if (e > max) max = e;
  }
  return max;
}
