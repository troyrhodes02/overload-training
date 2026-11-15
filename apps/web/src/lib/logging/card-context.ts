import type {
  PreviousPerformanceDto,
  ReferencePerformanceDto,
  WeightContext,
} from "@overload/shared/contracts/logging";
import {
  chronologically,
  currentSegment,
  prescriptionOf,
  type SegmentCandidate,
} from "@overload/shared/progression/recurring";

/**
 * The exercise card's weight and context (Prescription-Aware Intelligence
 * spec §7.2; RD-8). Pure: the caller loads the performed exercise's history
 * through the account-scoped client and passes it in.
 *
 *   before   = occurrences on or before this workout's date (same date →
 *              created earlier), this one excluded (the OVE-61 bound: a
 *              later-dated workout logged out of order never supplies it);
 *   segment  = the shared comparable run of THIS recurring workout;
 *   trusted  = the segment in this occurrence's scheduled-deload status;
 *   weight   = the top planned working set of the newest trusted occurrence
 *              that has a loaded planned working set;
 *   previous = the newest trusted occurrence with any set;
 *   reference = only when there is no previous: the newest other earlier
 *              occurrence with any set (display only, never a weight).
 *
 * The gym baseline is not an input: it is no longer a weight source (RD-9).
 */
export type CardHistoryRow = {
  id: string;
  dateIso: string;
  createdAtIso: string;
  gymId: string | null;
  lineageId: string | null;
  sessionName: string | null;
  plannedSets: number;
  repMin: number;
  repMax: number;
  scheduledDeload: boolean;
  sets: { setNumber: number; weightLbs: number | null; reps: number }[];
};

export type CardCurrent = {
  id: string;
  dateIso: string;
  createdAtIso: string;
  exerciseId: string;
  gymId: string | null;
  lineageId: string | null;
  repMin: number;
  repMax: number;
  scheduledDeload: boolean;
  gymVariable: boolean;
  externalLoad: boolean;
};

export type CardWeightContext = {
  suggestedWeightLbs: number | null;
  previousPerformance: PreviousPerformanceDto | null;
  referencePerformance: ReferencePerformanceDto | null;
  weightContext: WeightContext;
};

type Candidate = SegmentCandidate & { row: CardHistoryRow };

function toCandidate(r: CardHistoryRow, exerciseId: string): Candidate {
  return {
    id: r.id,
    dateIso: r.dateIso,
    orderKey: r.createdAtIso,
    key: { lineageId: r.lineageId, exerciseId, gymId: r.gymId },
    prescription: prescriptionOf({
      targetRepMin: r.repMin,
      targetRepMax: r.repMax,
    }),
    row: r,
  };
}

/** The heaviest loaded PLANNED working set (an extra set is never the anchor). */
function topPlannedLoad(r: CardHistoryRow): number | null {
  let top: number | null = null;
  for (const s of r.sets) {
    if (s.setNumber < 1 || s.setNumber > r.plannedSets) continue;
    if (s.weightLbs === null) continue;
    if (top === null || s.weightLbs > top) top = s.weightLbs;
  }
  return top;
}

function toPerformance(
  r: CardHistoryRow,
  gymScoped: boolean,
): PreviousPerformanceDto {
  return {
    dateIso: r.dateIso,
    gymScoped,
    sets: r.sets
      .slice()
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((s) => ({
        setNumber: s.setNumber,
        weightLbs: s.weightLbs,
        reps: s.reps,
      })),
    sessionName: r.sessionName,
    repRange: { min: r.repMin, max: r.repMax },
  };
}

export function cardWeightContext(
  history: readonly CardHistoryRow[],
  current: CardCurrent,
): CardWeightContext {
  const none: CardWeightContext = {
    suggestedWeightLbs: null,
    previousPerformance: null,
    referencePerformance: null,
    weightContext: "none",
  };
  // A machine or cable with no gym has no context at all (Faster Logging R9).
  if (current.gymVariable && !current.gymId) return none;

  const self = {
    dateIso: current.dateIso,
    orderKey: current.createdAtIso,
    id: current.id,
  };
  const before = history
    .filter((r) => r.id !== current.id)
    // Machines: only this gym's history, never another gym's numbers.
    .filter((r) => !current.gymVariable || r.gymId === current.gymId)
    .map((r) => toCandidate(r, current.exerciseId))
    .filter((c) => {
      // Strictly earlier date, or same date and created earlier (OVE-61).
      if (c.dateIso !== self.dateIso) return c.dateIso < self.dateIso;
      return c.orderKey < self.orderKey;
    });

  const segment = currentSegment(before, {
    key: {
      lineageId: current.lineageId,
      exerciseId: current.exerciseId,
      gymId: current.gymId,
    },
    prescription: prescriptionOf({
      targetRepMin: current.repMin,
      targetRepMax: current.repMax,
    }),
    gymVariable: current.gymVariable,
  });
  const trusted = segment
    .filter((c) => c.row.scheduledDeload === current.scheduledDeload)
    .sort((a, b) => chronologically(b, a)); // newest first

  let suggestedWeightLbs: number | null = null;
  if (current.externalLoad) {
    for (const c of trusted) {
      const top = topPlannedLoad(c.row);
      if (top !== null && top > 0) {
        suggestedWeightLbs = top;
        break;
      }
    }
  }

  const prev = trusted.find((c) => c.row.sets.length > 0) ?? null;
  const previousPerformance = prev
    ? toPerformance(prev.row, current.gymVariable)
    : null;

  let referencePerformance: ReferencePerformanceDto | null = null;
  if (!previousPerformance) {
    const trustedIds = new Set(trusted.map((c) => c.id));
    const ref = before
      .filter((c) => !trustedIds.has(c.id) && c.row.sets.length > 0)
      .sort((a, b) => chronologically(b, a))[0];
    referencePerformance = ref
      ? toPerformance(ref.row, current.gymVariable)
      : null;
  }

  return {
    suggestedWeightLbs,
    previousPerformance,
    referencePerformance,
    // "trusted" whenever this workout's comparable last time exists — with
    // its weight in the box when the exercise takes one (bodyweight has none).
    weightContext:
      previousPerformance !== null
        ? "trusted"
        : referencePerformance !== null
          ? "reference_only"
          : "none",
  };
}
