import type { DashboardDto } from "@overload/shared/contracts/logging";
import type { PlannedProgressionDto } from "@overload/shared/contracts/progression";
import type { TodayDto } from "@overload/shared/contracts/views";
import type { InsightReadState } from "../workout/insight-model";

/**
 * Today's planned-list calls (Pitch 21g OVE-230, web parity), from the
 * separate gated Today read. No I/O and no rule: it only decides whether the
 * calls that read returned belong to the day the core read is showing.
 *
 * Calls show only for a day still to train (pending or in progress), and only
 * when the full read's day is the SAME day as the core read's — same session,
 * same date, same exercises in the same order — so a call can never be
 * attached to the wrong lift. A read in flight with no answer yet, failed,
 * waiting for a connection, or invalidated by a write shows no calls (never a
 * stale one); an ordinary re-check keeps the shown ones until it lands.
 */
export function plannedCalls(
  core: DashboardDto,
  read: InsightReadState,
  full: TodayDto | undefined,
): PlannedProgressionDto[] | null {
  if (read.isPaused || read.isError) return null;
  if (read.isFetching && (!read.hasData || read.isInvalidated)) return null;
  if (!full) return null;
  if (core.kind !== "pending" && core.kind !== "in_progress") return null;
  const f = full.dashboard;
  if (f.kind !== core.kind) return null;
  if (f.sessionId !== core.sessionId || f.scheduledFor !== core.scheduledFor)
    return null;
  const ids = core.exercises.map((e) => e.exerciseId);
  if (
    f.exercises.length !== ids.length ||
    f.exercises.some((e, i) => e.exerciseId !== ids[i]) ||
    full.plannedProgression.length !== ids.length ||
    full.plannedProgression.some((p, i) => p.exerciseId !== ids[i])
  ) {
    return null;
  }
  return full.plannedProgression.map((p) => p.progression);
}

/** Today's Pro note (the web's today-plan sentence, without a link). */
export const TODAY_PRO_NOTE =
  "Progress, hold, and deload calls, with the weight to try, are part of Pro.";
