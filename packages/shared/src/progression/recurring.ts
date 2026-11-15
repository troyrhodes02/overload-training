/**
 * Recurring exercises and comparable evidence (Prescription-Aware
 * Intelligence spec §6; RD-2, RD-5..RD-7).
 *
 * A RECURRING EXERCISE is one exercise inside one durable recurring workout:
 * the workout's session lineage plus the PERFORMED exercise, plus the gym for
 * gym-variable equipment (a machine's pounds never compare across gyms). Bench
 * in Push and bench in Upper are two recurring exercises of one Exercise.
 *
 * A SEGMENT is the contiguous run of a recurring exercise's history that is
 * comparable with an anchor occurrence, walked newest to oldest and stopped at
 * the first incompatible performance. Returning to an old rep range therefore
 * starts a new segment: an earlier run is never stitched on.
 *
 * Compatibility is deterministic, with no similarity threshold:
 *   - the rep range must be equal (min and max);
 *   - target RIR uses the EFFECTIVE target: the anchor's recorded target, or,
 *     if it has none, the first recorded target met in the walk. A performance
 *     with no recorded target is compatible; a recorded target must equal the
 *     effective one. So a missing target never bridges two different
 *     recorded targets, and introducing targets resets nothing.
 * Set count, session name, weekday, order, and notes play no part.
 *
 * Scheduled-deload-week and short performances stay in the run; each consumer
 * filters them as it already does (the engine drops them from its windows; a
 * normal-week prefill skips deload weeks). Pure module: no Prisma, no React.
 */

export type Prescription = {
  repMin: number;
  repMax: number;
  /** Null until Planned Workout Guidance records a target (RD-7). */
  targetRirMin: number | null;
  targetRirMax: number | null;
};

export type RecurringKey = {
  /** The workout's session lineage; null when it had no session. */
  lineageId: string | null;
  /** The PERFORMED exercise. */
  exerciseId: string;
  /** The workout's gym; compared only for gym-variable equipment. */
  gymId: string | null;
};

export type SegmentCandidate = {
  /** The LoggedExercise id. */
  id: string;
  /** The workout's scheduled date, YYYY-MM-DD. */
  dateIso: string;
  /** Same-date tie-break (creation time, ISO); then `id`. */
  orderKey: string;
  key: RecurringKey;
  prescription: Prescription;
};

export type SegmentAnchor = {
  key: RecurringKey;
  prescription: Prescription;
  /** isGymVariable(performed exercise): the gym is part of the identity. */
  gymVariable: boolean;
};

/** The prescription a plan or copied snapshot states (no target RIR yet). */
export function prescriptionOf(p: {
  targetRepMin: number;
  targetRepMax: number;
  targetRirMin?: number | null;
  targetRirMax?: number | null;
}): Prescription {
  return {
    repMin: p.targetRepMin,
    repMax: p.targetRepMax,
    targetRirMin: p.targetRirMin ?? null,
    targetRirMax: p.targetRirMax ?? null,
  };
}

/** Same recurring exercise. A missing lineage never matches anything. */
export function sameRecurringExercise(
  a: RecurringKey,
  b: RecurringKey,
  gymVariable: boolean,
): boolean {
  if (a.lineageId === null || b.lineageId === null) return false;
  if (a.lineageId !== b.lineageId) return false;
  if (a.exerciseId !== b.exerciseId) return false;
  return gymVariable ? a.gymId !== null && a.gymId === b.gymId : true;
}

/** Chronological order: date, then creation, then id (deterministic). */
export function chronologically(
  a: Pick<SegmentCandidate, "dateIso" | "orderKey" | "id">,
  b: Pick<SegmentCandidate, "dateIso" | "orderKey" | "id">,
): number {
  if (a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? -1 : 1;
  if (a.orderKey !== b.orderKey) return a.orderKey < b.orderKey ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

type Target = { min: number; max: number } | null;

function targetOf(p: Prescription): Target {
  return p.targetRirMin !== null && p.targetRirMax !== null
    ? { min: p.targetRirMin, max: p.targetRirMax }
    : null;
}

/**
 * The contiguous comparable run of the anchor's recurring exercise, oldest
 * first. Candidates of other recurring exercises are ignored (they neither
 * join nor break the run). Empty when the newest same-identity performance is
 * already incompatible.
 */
export function currentSegment<T extends SegmentCandidate>(
  candidates: readonly T[],
  anchor: SegmentAnchor,
): T[] {
  const same = candidates
    .filter((c) => sameRecurringExercise(anchor.key, c.key, anchor.gymVariable))
    .slice()
    .sort((a, b) => chronologically(b, a)); // newest first
  let effective: Target = targetOf(anchor.prescription);
  const run: T[] = [];
  for (const c of same) {
    if (
      c.prescription.repMin !== anchor.prescription.repMin ||
      c.prescription.repMax !== anchor.prescription.repMax
    ) {
      break;
    }
    const t = targetOf(c.prescription);
    if (t !== null) {
      if (effective === null) effective = t;
      else if (t.min !== effective.min || t.max !== effective.max) break;
    }
    run.push(c);
  }
  return run.reverse();
}

/**
 * The segment a past performance belonged to, judged at that performance:
 * the run ending at `target` among the candidates up to and including it,
 * anchored on the target's own key and prescription. Used for the call each
 * past session led to, so it agrees with what the card said that day.
 */
export function segmentEndingAt<T extends SegmentCandidate>(
  candidates: readonly T[],
  target: T,
  gymVariable: boolean,
): T[] {
  const upTo = candidates.filter((c) => chronologically(c, target) <= 0);
  return currentSegment(upTo, {
    key: target.key,
    prescription: target.prescription,
    gymVariable,
  });
}
