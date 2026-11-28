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
 * A workout started on an EARLIER day (account time zone) and never finished
 * (Pitch 21g OVE-228). Today lists these so an unfinished workout never
 * disappears behind today's plan. Only workouts with at least one saved set
 * are listed: a workout started with nothing logged has nothing to resume
 * (it stays in History). Read only; the state is the workout's own status.
 */
export type UnfinishedWorkoutDto = {
  loggedSessionId: string;
  /** Pitch 25; absent from an older server: "planned". */
  kind?: "planned" | "wing_it";
  /** The planned session's name ("Upper A"), or "Workout" without one. */
  sessionName: string;
  /** The day it was scheduled for (its date never changes on resume). */
  scheduledFor: IsoDate;
  gymName: string | null;
  /** Saved working sets (setNumber 1..plannedSets) across its exercises. */
  setsLogged: number;
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
  /**
   * Pitch 21g (OVE-228): workouts from earlier days still in progress, newest
   * first, in every dashboard state and in the core fields too. Optional so
   * an older server's answer still type-checks: a client treats it as [].
   */
  unfinishedWorkouts?: UnfinishedWorkoutDto[];
  /**
   * Pitch 25: the Wing-It workout section, on every dashboard state. Optional
   * so an older server's answer still type-checks; the installed app that
   * predates Wing-It ignores it.
   */
  wingIt?: WingItTodayDto;
};

/** One Wing-It workout as Today lists it (Pitch 25). */
export type WingItSummaryDto = {
  loggedSessionId: string;
  gymName: string | null;
  exerciseCount: number;
  /** Every saved set (an open-ended exercise has no extra sets). */
  setsLogged: number;
  /** The day it was started, account time zone. */
  startedOn: IsoDate;
};

export type WingItTodayDto = {
  /** The account's one open Wing-It workout (any day), or null. */
  open: WingItSummaryDto | null;
  /** Wing-It workouts finished on today's date, oldest first. */
  finishedToday: WingItSummaryDto[];
  /**
   * The workout to finish or resume before a Wing-It workout can start: one
   * in progress with saved sets (newest), when no Wing-It workout is open.
   */
  blockedBy: { loggedSessionId: string; sessionName: string } | null;
};

/**
 * The query parameter and value that ask `GET /today`, `GET /workouts/{id}`,
 * and `GET /history/{id}` for their core fields only (Pitch 21e Checkpoint A
 * round 2, RD-28). A client that renders no progression calls, summaries, or
 * goals yet (the 21e app) sends it, and the server skips computing them:
 *
 * - Today: `plannedProgression` is `[]`, `sessionSummary` null,
 *   `sessionGoals` `[]`, and `goals` null; goal completion is not reconciled
 *   on this read (each set and each finish still reconciles it).
 *   `unfinishedWorkouts` (Pitch 21g) is state, not a call, and is kept.
 * - Workout: `progression` is `[]` (as it already is for a finished workout).
 * - Logged workout: `summary` is null and `goals` `[]`.
 *
 * Every other field is exactly the full answer's. Without the parameter, or
 * with any other value, the answer is the full one, unchanged, so older and
 * other clients are unaffected. It never adds Pro data: it only leaves out.
 */
export const CORE_FIELDS_QUERY = "fields=core";

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
