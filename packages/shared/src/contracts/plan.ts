/**
 * Mesocycles, their weeks, and session templates (read-only on the phone).
 * Built by apps/web/src/lib/plan/queries.ts (moved here in Pitch 21b, so the
 * compiler holds the server's output to the contract). Wire conventions:
 * ./wire.ts.
 */
import type { MesocycleStatusValue, SplitTypeValue } from "../enums";
import type { Readiness } from "../plan/readiness";

export type MesocycleSummaryDto = {
  id: string;
  name: string;
  status: MesocycleStatusValue;
  splitType: SplitTypeValue;
  splitLabel: string;
  startDate: string | null;
  endDate: string | null;
  lengthWeeks: number;
  deloadEveryWeeks: number;
  sessionCount: number;
  issueCount: number;
};

export type SessionSummaryDto = {
  id: string;
  name: string;
  dayOfWeek: number | null;
  exerciseCount: number;
  archivedCount: number;
};

export type PlannedExerciseDto = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  primaryMuscleLabel: string;
  equipmentLabel: string;
  isCustom: boolean;
  imageUrl: string | null;
  isArchived: boolean;
  plannedSets: number;
  targetRepMin: number;
  targetRepMax: number;
  position: number;
};

/** One planned cardio item on a weekday (Cardio Logging). */
export type PlannedCardioDto = {
  id: string;
  dayOfWeek: number;
  type: string;
  durationMin: number;
};

export type MesocycleWeekDto = MesocycleSummaryDto & {
  /** Index 0 = Monday … 6 = Sunday. */
  week: (SessionSummaryDto | null)[];
  /** The day's planned cardio, same indexing as `week` (zero or one per day). */
  cardio: (PlannedCardioDto | null)[];
  unscheduled: SessionSummaryDto[];
  readiness: Readiness;
  /** The currently active block, when it is not this one. */
  activeOther: { id: string; name: string } | null;
};

export type MesocycleHomeDto = {
  active: MesocycleSummaryDto | null;
  drafts: MesocycleSummaryDto[];
  previous: MesocycleSummaryDto[];
};

/** Which session (if any) sits on each weekday — for the day pickers. */
export type DayOccupancyDto = {
  dayOfWeek: number;
  sessionId: string | null;
  sessionName: string | null;
};

export type SessionDetailDto = {
  id: string;
  name: string;
  dayOfWeek: number | null;
  mesocycle: { id: string; name: string; status: MesocycleStatusValue };
  exercises: PlannedExerciseDto[];
  occupancy: DayOccupancyDto[];
};
