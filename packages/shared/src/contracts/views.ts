/**
 * Composite responses the mobile API assembles from the server's existing
 * reads (21c onward). Each part is a contract the web already returns; the
 * composition is the draft 21c finalizes before the first app build. Gated
 * parts keep `locked` exactly as the server's gate returns them.
 */
import type { ActiveGoalDto, SessionGoalRowDto } from "./goals";
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

/** `GET /today`: the Today screen. */
export type TodayDto = {
  /** Today in the account's time zone. */
  today: IsoDate;
  /** Built on the server (the greeting needs the dashboard and the account). */
  greeting: string;
  dashboard: DashboardDto;
  /** The planned call per exercise on today's list (gated). */
  plannedProgression: {
    exerciseId: string;
    progression: PlannedProgressionDto;
  }[];
  /** The day-complete summary (gated), or null before the workout is done. */
  sessionSummary: SessionProgressionSummaryDto | null;
  /** Goal rows for a finished workout. */
  sessionGoals: SessionGoalRowDto[];
  /** Active goals, present only when the dashboard shows goals. */
  activeGoals: ActiveGoalDto[] | null;
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
