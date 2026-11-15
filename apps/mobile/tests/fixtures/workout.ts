import type {
  ExerciseCardDto,
  WorkoutDto,
} from "@overload/shared/contracts/logging";
import type { WorkoutViewDto } from "@overload/shared/contracts/views";

/** Planned rows 1..n, unsaved, as the server sends a fresh card. */
export const rows = (n: number): ExerciseCardDto["sets"] =>
  Array.from({ length: n }, (_, i) => ({
    setNumber: i + 1,
    loggedSetId: null,
    weightLbs: null,
    reps: null,
    rir: null,
    saved: false,
    extra: false,
  }));

export const card = (over: Partial<ExerciseCardDto> = {}): ExerciseCardDto => ({
  loggedExerciseId: "le-bench",
  performedExerciseName: "Barbell Bench Press",
  plannedExerciseName: "Barbell Bench Press",
  performedExerciseId: "ex-bench",
  plannedPrimaryMuscle: "chest",
  swapped: false,
  performedArchived: false,
  isGymVariable: false,
  requiresExternalWeight: true,
  gymName: "Downtown Gym",
  plannedSets: 3,
  plannedRepRange: { min: 3, max: 5 },
  suggestedWeightLbs: 255,
  workingWeightFromBaseline: false,
  previousPerformance: {
    dateIso: "2026-11-07",
    gymScoped: false,
    sets: [
      { setNumber: 1, weightLbs: 255, reps: 5 },
      { setNumber: 2, weightLbs: 255, reps: 5 },
      { setNumber: 3, weightLbs: 255, reps: 4 },
    ],
    sessionName: "Push",
    repRange: { min: 3, max: 5 },
  },
  referencePerformance: null,
  weightContext: "trusted",
  skipped: false,
  sets: rows(3),
  ...over,
});

/** Upper's first time: Push's 255 exists only as reference. */
export const referenceOnlyCard = (): ExerciseCardDto =>
  card({
    plannedRepRange: { min: 6, max: 8 },
    suggestedWeightLbs: null,
    previousPerformance: null,
    referencePerformance: card().previousPerformance,
    weightContext: "reference_only",
  });

export const workout = (over: Partial<WorkoutDto> = {}): WorkoutDto => ({
  loggedSessionId: "ls-1",
  sessionName: "Push",
  scheduledFor: "2026-11-14",
  status: "in_progress",
  gymName: "Downtown Gym",
  gymLocked: false,
  isHistoricalDate: false,
  scheduledDeloadWeek: false,
  exercises: [card()],
  complete: false,
  ...over,
});

export const view = (w: WorkoutDto = workout()): WorkoutViewDto => ({
  workout: w,
  progression: [],
});
