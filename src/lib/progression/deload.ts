/**
 * Scheduled-deload helpers (spec §11a; Resolved Decisions R32–R36, R41).
 *
 * The SCHEDULED deload is mesocycle-wide planned recovery, entirely separate
 * from the reactive per-exercise Deload call. These pure helpers decide whether
 * an occurrence's effective week is a scheduled-deload week and what reduced
 * load to suggest. Pure module — no Prisma, no React.
 */
import { SCHEDULED_DELOAD_FACTOR, LOAD_STEP_LBS } from "./config";

/**
 * A scheduled deload falls on every Nth mesocycle week (weeks N, 2N, 3N…),
 * matching Mesocycle.deloadEveryWeeks (R33). Week is the effective occurrence
 * week (R41), 1-based. Returns false for a zero/absent cadence.
 */
export function isScheduledDeloadWeek(
  week: number,
  deloadEveryWeeks: number,
): boolean {
  if (!Number.isInteger(week) || week < 1) return false;
  if (!Number.isInteger(deloadEveryWeeks) || deloadEveryWeeks < 1) return false;
  return week % deloadEveryWeeks === 0;
}

/**
 * The suggested scheduled-deload working load: 90% of the normal working-weight
 * context, rounded DOWN to the nearest load step (R33, R35). Rounding down
 * guarantees the suggestion never exceeds the raw 90% target, so a deload never
 * accidentally prescribes more than intended.
 *
 *   200 → 180, 185 → 166.5 → 165, 100 → 90.
 *
 * The caller supplies the base (gym baseline for gym-variable, latest working
 * weight otherwise); if no base exists the caller omits the number (R36).
 */
export function scheduledDeloadLoad(baseLbs: number): number {
  const reduced = baseLbs * SCHEDULED_DELOAD_FACTOR;
  return Math.floor(reduced / LOAD_STEP_LBS) * LOAD_STEP_LBS;
}
