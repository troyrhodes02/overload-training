/**
 * Composite responses the mobile API assembles from the server's existing
 * reads (21c onward). Each part is a contract the web already returns; the
 * composition is the draft 21c finalizes before the first app build. Gated
 * parts keep `locked` exactly as the server's gate returns them.
 */
import type { ActiveGoalDto, GoalReachedDto, SessionGoalRowDto } from "./goals";
import type {
  DashboardDto,
  LoggedWorkoutDetailDto,
  WorkoutDto,
} from "./logging";
import type {
  OccurrenceProgressionDto,
  PlannedProgressionDto,
  SessionProgressionSummaryDto,
} from "./progression";
import type { IsoDate, IsoDateTime } from "./wire";

/**
 * The goals block Today shows when no training action is pending (Goals R42,
 * R43): unacknowledged "Goal reached" cards, then at most three active goals,
 * and how many active goals there are in all.
 */
export type TodayGoalsDto = {
  reached: GoalReachedDto[];
  active: ActiveGoalDto[];
  activeTotal: number;
};

/**
 * `GET /today`: the Today screen, built by the same server function the web's
 * Today page renders from (Pitch 21c spec §9.2). Finalized in 21c before any
 * client existed; from here on v1 changes are additive only.
 */
export type TodayDto = {
  /** Today in the account's time zone. */
  today: IsoDate;
  /** Built on the server (the greeting needs the dashboard and the account). */
  greeting: string;
  dashboard: DashboardDto;
  /**
   * The planned call per exercise of the day shown — the dashboard itself, or
   * `below` on a missed day — one entry per exercise, in list order (gated:
   * `locked` and null Pro fields on a Free account).
   */
  plannedProgression: {
    exerciseId: string;
    progression: PlannedProgressionDto;
  }[];
  /** The day-complete summary (gated), or null before the workout is done. */
  sessionSummary: SessionProgressionSummaryDto | null;
  /** Goal rows for a finished workout (only the goals it moved). */
  sessionGoals: SessionGoalRowDto[];
  /** Present only when the dashboard shows goals (no training action pending). */
  goals: TodayGoalsDto | null;
};

/** `GET /workouts/{loggedSessionId}`: the workout runner. */
export type WorkoutViewDto = {
  workout: WorkoutDto;
  /** The card's call per exercise (gated by `progression_insights`). */
  progression: {
    loggedExerciseId: string;
    progression: OccurrenceProgressionDto;
  }[];
};

/** `GET /history/{loggedSessionId}`: one logged workout. */
export type LoggedWorkoutDetailViewDto = {
  detail: LoggedWorkoutDetailDto;
  summary: SessionProgressionSummaryDto | null;
  goals: SessionGoalRowDto[];
};

/** A logged set as stored: exactly as entered, no derived value. */
export type LoggedSetDto = {
  id: string;
  loggedExerciseId: string;
  setNumber: number;
  /** Null for a bodyweight set, never 0. */
  weightLbs: number | null;
  reps: number;
  /** Null when not recorded, never 0. */
  rir: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};
