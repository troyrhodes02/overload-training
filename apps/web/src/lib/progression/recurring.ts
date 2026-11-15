import {
  currentSegment,
  prescriptionOf,
  segmentEndingAt,
  type Prescription,
  type RecurringKey,
  type SegmentCandidate,
} from "@overload/shared/progression/recurring";
import type { PerformanceRow } from "./queries";

/**
 * Prescription-Aware Intelligence (spec §6, §7.3): the gathered progression
 * rows seen as segment candidates, so every reader selects its evidence with
 * the one shared rule (`@overload/shared/progression/recurring`). Pure — no
 * data access; the rows come from `gatherRows`.
 */

type RowCandidate = SegmentCandidate & { row: PerformanceRow };

function candidate(row: PerformanceRow, exerciseId: string): RowCandidate {
  return {
    id: row.perf.loggedExerciseId,
    dateIso: row.perf.dateIso,
    orderKey: row.createdAtIso,
    key: { lineageId: row.lineageId, exerciseId, gymId: row.perf.gymId },
    prescription: prescriptionOf({
      targetRepMin: row.perf.repMin,
      targetRepMax: row.perf.repMax,
    }),
    row,
  };
}

export type RowAnchor = {
  key: RecurringKey;
  prescription: Prescription;
  gymVariable: boolean;
};

/** The anchor's comparable run of the exercise's rows, oldest first. */
export function segmentRows(
  rows: readonly PerformanceRow[],
  exerciseId: string,
  anchor: RowAnchor,
): PerformanceRow[] {
  return currentSegment(
    rows.map((r) => candidate(r, exerciseId)),
    anchor,
  ).map((c) => c.row);
}

/** The run a past row belonged to, judged at that row (oldest first). */
export function rowSegmentEndingAt(
  rows: readonly PerformanceRow[],
  exerciseId: string,
  target: PerformanceRow,
  gymVariable: boolean,
): PerformanceRow[] {
  const all = rows.map((r) => candidate(r, exerciseId));
  const t = all.find((c) => c.row === target);
  if (!t) return [];
  return segmentEndingAt(all, t, gymVariable).map((c) => c.row);
}

/** A row's own anchor (its lineage, performed exercise, gym, and copy). */
export function anchorOfRow(
  row: PerformanceRow,
  exerciseId: string,
  gymVariable: boolean,
): RowAnchor {
  const c = candidate(row, exerciseId);
  return { key: c.key, prescription: c.prescription, gymVariable };
}
