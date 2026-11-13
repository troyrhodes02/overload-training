/**
 * Today, the workout, swaps, the week schedule, a logged workout, and missed-
 * day resolutions. The web's server reads
 * (apps/web/src/lib/logging/queries.ts, missed-days.ts) build these exact
 * types (moved here in Pitch 21b, so the compiler holds the server's output to
 * the contract). Wire conventions: ./wire.ts.
 */
import type {
  LoggedSessionStatusValue as LoggedSessionStatus,
  ResolvableMissedDayOutcome,
} from "../enums";
import type { MuscleGroupValue } from "../exercises/taxonomy";
import type { CardioOccurrenceDto } from "./cardio";

export type DashboardExercisePreview = {
  name: string;
  scheme: string;
  done: boolean;
  /** Performed/planned exercise identity, so the dashboard can derive its tag (OVE-28). */
  exerciseId: string;
  isGymVariable: boolean;
};

export type MissedDayInfo = {
  mesocycleId: string;
  sessionId: string;
  sessionName: string;
  missedOn: string;
  daysAgo: number;
};

export type DashboardTodayDto = {
  kind: "pending" | "in_progress" | "complete";
  sessionId: string;
  loggedSessionId: string | null;
  sessionName: string;
  scheduledFor: string;
  week: number;
  /** This occurrence's week is a scheduled-deload week (OVE-28; R41). */
  scheduledDeloadWeek: boolean;
  gymName: string | null;
  exercises: DashboardExercisePreview[];
  setsLogged: number;
  /** Today's cardio (Cardio Logging): independent of the lifting state. */
  cardio: CardioOccurrenceDto[];
};

/**
 * The dashboard state. Cardio never changes the kind (Cardio Logging R66): a
 * cardio-only day is still `rest` for lifting, with its cardio alongside, so
 * the lifting state machine and the Goals rules keyed on `kind` are unchanged.
 */
export type DashboardDto =
  | { kind: "no_plan" }
  | { kind: "rest"; week: number; cardio: CardioOccurrenceDto[] }
  | {
      kind: "missed_day";
      today: string;
      missed: MissedDayInfo;
      below: DashboardTodayDto | null;
      cardio: CardioOccurrenceDto[];
    }
  | DashboardTodayDto;

export type ExerciseCardDto = {
  loggedExerciseId: string;
  performedExerciseName: string;
  plannedExerciseName: string;
  performedExerciseId: string;
  plannedPrimaryMuscle: MuscleGroupValue;
  swapped: boolean;
  performedArchived: boolean;
  isGymVariable: boolean;
  /** False for a pure bodyweight exercise: sets are reps only, no weight input. */
  requiresExternalWeight: boolean;
  gymName: string | null;
  plannedSets: number;
  plannedRepRange: { min: number; max: number };
  /**
   * The working weight: the first set's offered weight (Faster Logging UX R6,
   * R9). Gym-scoped for gym-variable exercises; null for bodyweight or when no
   * context exists. Display/prefill only — never written on its own.
   */
  suggestedWeightLbs: number | null;
  /** True when that weight is this gym's GymExerciseBaseline (captioned "working weight", not "last time"; R27). */
  workingWeightFromBaseline: boolean;
  /** The most recent earlier performance in scope (Faster Logging UX R11). */
  previousPerformance: PreviousPerformanceDto | null;
  /** Marked "Didn't do" (or left with no sets when the workout finished). */
  skipped: boolean;
  /** Planned rows 1..plannedSets, then any logged extra sets. */
  sets: {
    setNumber: number;
    /** The LoggedSet's id when saved (in-card correction); null otherwise. */
    loggedSetId: string | null;
    weightLbs: number | null;
    reps: number | null;
    /** Recorded reps in reserve; null when not recorded or not saved (never 0). */
    rir: number | null;
    saved: boolean;
    /** Beyond the plan: recorded, not used by progression. */
    extra: boolean;
  }[];
};

/**
 * What the lifter did the last time they performed this exercise (Faster
 * Logging UX §11.1). Read-only context for the card; never fed to the engine.
 */
export type PreviousPerformanceDto = {
  /** The earlier workout's scheduled date, YYYY-MM-DD. */
  dateIso: string;
  /** True for a gym-variable exercise: only this gym's history counts. */
  gymScoped: boolean;
  /** Set-number order, extras included. Null weight = a bodyweight set. */
  sets: { setNumber: number; weightLbs: number | null; reps: number }[];
};

export type WorkoutDto = {
  loggedSessionId: string;
  sessionName: string;
  scheduledFor: string;
  status: LoggedSessionStatus;
  gymName: string | null;
  gymLocked: boolean;
  isHistoricalDate: boolean;
  exercises: ExerciseCardDto[];
  complete: boolean;
};

export type SwapCandidate = { id: string; name: string; isFavorite: boolean };

export type SwapContextDto = {
  loggedExerciseId: string;
  plannedExerciseName: string;
  /** The planned exercise's primary muscle (the picker's starting filter). */
  plannedMuscle: MuscleGroupValue;
  primaryMuscleLabel: string;
  /** The muscle group the candidates are listed for. */
  selectedMuscle: MuscleGroupValue;
  selectedMuscleLabel: string;
  swapLocked: boolean;
  candidates: SwapCandidate[];
};

export type WeekDayState =
  "upcoming" | "in_progress" | "complete" | "skipped" | "shifted";

export type WeekDayDto = {
  dateIso: string;
  dayLabel: string;
  sessionName: string;
  state: WeekDayState;
  loggedSessionId: string | null;
};

export type WeekScheduleDto = {
  weekNumber: number;
  lengthWeeks: number;
  rangeLabel: string;
  days: WeekDayDto[];
  /** The week's cardio, placed on effective dates (Cardio Logging). */
  cardio: CardioOccurrenceDto[];
};

export type LoggedWorkoutDetailDto = {
  loggedSessionId: string;
  sessionName: string;
  dateIso: string;
  dateLabel: string;
  gymName: string | null;
  exercises: {
    /** The LoggedExercise row id — the target of a planned-sets correction. */
    loggedExerciseId: string;
    /** The PERFORMED exercise (its history is what the lifter did). */
    exerciseId: string;
    /** Its history page; a machine/cable opens on this workout's gym. */
    historyHref: string;
    performedName: string;
    plannedName: string;
    swapped: boolean;
    archived: boolean;
    /** Didn't do it (no sets). */
    skipped: boolean;
    /** False for a pure bodyweight exercise: corrections edit reps only. */
    requiresExternalWeight: boolean;
    plannedSets: number;
    sets: {
      loggedSetId: string;
      setNumber: number;
      /** Null for a bodyweight (reps-only) set — shown as reps, never "0 lbs". */
      weightLbs: number | null;
      reps: number;
      /** Recorded reps in reserve; null = not recorded (never shown as 0). */
      rir: number | null;
      /** Beyond the plan. */
      extra: boolean;
    }[];
  }[];
};

export type MissedDayResolutionDto = {
  id: string;
  missedOn: string;
  /** Shift or skip; "log it late" starts a workout instead. */
  outcome: ResolvableMissedDayOutcome;
};
