/**
 * Mesocycles, their weeks, and session templates (read-only on the phone).
 * Built by apps/web/src/lib/plan/queries.ts (moved here in Pitch 21b, so the
 * compiler holds the server's output to the contract). Wire conventions:
 * ./wire.ts.
 */
import type { MesocycleStatusValue, SplitTypeValue } from "../enums";
import type { Readiness } from "../plan/readiness";
import type { CardioOccurrenceDto } from "./cardio";
import type { WeekDayState } from "./logging";

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
  /**
   * False for a pure bodyweight exercise, which is logged as reps only
   * (Pitch 21h; the shared loading-mode rule, decided on the server).
   */
  requiresExternalWeight: boolean;
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

// ── Pitch 21h: the plan on the phone (read-only). Built by
//    apps/web/src/lib/views/plan.ts from the existing plan and schedule reads.

/** Where the account's today sits in the active block. */
export type PlanBlockPosition =
  | { kind: "upcoming"; startsOn: string }
  | { kind: "running"; week: number; scheduledDeloadWeek: boolean }
  | { kind: "ended"; endedOn: string };

/** One effective occurrence on a day, in History's states. */
export type PlanDaySessionDto = {
  sessionId: string;
  sessionName: string;
  state: WeekDayState;
  loggedSessionId: string | null;
};

/** One calendar day of a block week. No sessions = a rest day. */
export type PlanDayDto = {
  dateIso: string;
  /** "Mon, Nov 16". */
  dayLabel: string;
  isToday: boolean;
  /** Usually zero or one; a shift can put two on one day. */
  sessions: PlanDaySessionDto[];
  cardio: CardioOccurrenceDto[];
};

/** One week of the block, dated, after missed-day shifts and skips. */
export type PlanWeekDto = {
  weekNumber: number;
  lengthWeeks: number;
  rangeLabel: string;
  scheduledDeloadWeek: boolean;
  /** The week holding the account's today (clamped into the block). */
  isCurrentWeek: boolean;
  /** Always seven, in date order. */
  days: PlanDayDto[];
};

export type PlanBlockDto = {
  summary: MesocycleSummaryDto;
  position: PlanBlockPosition;
  /** Every scheduled-deload week in the block (N, 2N, … up to its length). */
  deloadWeeks: number[];
  /** The authored template. Index 0 = Monday … 6 = Sunday. */
  template: (SessionSummaryDto | null)[];
  templateCardio: (PlannedCardioDto | null)[];
  unscheduled: SessionSummaryDto[];
  week: PlanWeekDto;
};

/** `GET /plan?week=n`: the active block (or none) and one of its weeks. */
export type PlanOverviewDto = {
  today: string;
  block: PlanBlockDto | null;
  /** Blocks only the web shows (drafts and archived ones). */
  otherBlocks: { drafts: number; previous: number };
};

/** `GET /mesocycles/{mesocycleId}/sessions/{sessionId}`: one authored session. */
export type PlanSessionDto = Omit<SessionDetailDto, "occupancy"> & {
  /** The planned cardio on the session's weekday; null when unscheduled. */
  cardio: PlannedCardioDto | null;
};
