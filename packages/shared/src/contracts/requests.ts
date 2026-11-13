/**
 * Request bodies for the mobile API's writes (implemented in 21c onward). Ids
 * that name the target travel in the path; the acting account comes from the
 * verified token, never from a body. The server validates every field with
 * the shared parsers (one rule set for both clients) and refuses anything
 * else with `validation_error`.
 */
import type { Appearance } from "../appearance/appearance";
import type { EquipmentValue, MuscleGroupValue } from "../exercises/taxonomy";
import type { FeedbackCategoryValue } from "../feedback/validation";
import type { ResolvableMissedDayOutcome, TourOutcomeValue } from "../enums";
import type { IsoDate } from "./wire";

/**
 * `weightLbs` is the external load. A bodyweight exercise (requiresExternalWeight
 * false) logs reps only: omit it or pass null. It is stored as NULL — never 0,
 * never a fake positive number, never a guessed bodyweight.
 *
 * `rir` is the optional reps in reserve (RIR Logging & Autoregulation R4):
 * omitted or null is stored as NULL ("not recorded") — never 0.
 */
export type LogSetInput = {
  loggedExerciseId: string;
  setNumber: number;
  weightLbs?: number | null;
  reps: number;
  rir?: number | null;
};

/**
 * `rir`: undefined leaves the stored value unchanged, so a payload without it
 * can never silently erase it; null clears it to "not recorded"; 0..4 sets it
 * (R9).
 */
export type EditLoggedSetInput = {
  loggedSetId: string;
  weightLbs?: number | null;
  reps: number;
  rir?: number | null;
};

/** `PUT /logged-exercises/{loggedExerciseId}/sets/{setNumber}`. */
export type LogSetRequest = Omit<LogSetInput, "loggedExerciseId" | "setNumber">;

/** `PATCH /sets/{loggedSetId}`. */
export type EditLoggedSetRequest = Omit<EditLoggedSetInput, "loggedSetId">;

/** `POST /workouts`: start, or resume the workout already started for this occurrence. */
export type StartWorkoutRequest = {
  sessionId: string;
  scheduledFor: IsoDate;
  gymId: string;
};

/** `PUT /workouts/{loggedSessionId}/gym`. */
export type ChangeGymRequest = { gymId: string };

/** `PUT /logged-exercises/{loggedExerciseId}/exercise`. */
export type SwapExerciseRequest = { newExerciseId: string };

/** `PUT /logged-exercises/{loggedExerciseId}/skipped`. */
export type SetSkippedRequest = { skipped: boolean };

/** `PATCH /logged-exercises/{loggedExerciseId}/planned-sets`. */
export type EditPlannedSetsRequest = { plannedSets: number };

/** `PUT /mesocycles/{mesocycleId}/missed-days/{missedOn}`. */
export type ResolveMissedDayRequest = { outcome: ResolvableMissedDayOutcome };

/** `PUT /mesocycles/{mesocycleId}/cardio-logs/{scheduledFor}`. */
export type LogCardioRequest = { type: string; durationMin: number };

/** `PATCH /cardio-logs/{cardioLogId}`. */
export type EditCardioLogRequest = { type: string; durationMin: number };

/** `POST /goals` (with an `Idempotency-Key` header). */
export type CreateGoalRequest = {
  exerciseId: string;
  /** Required for a machine or cable exercise; null otherwise. */
  gymId: string | null;
  targetWeightLbs: number;
  targetReps: number;
};

/** `POST /gyms` (with an `Idempotency-Key` header). */
export type CreateGymRequest = { name: string; address: string | null };

/** `POST /exercises` (with an `Idempotency-Key` header). */
export type CreateCustomExerciseRequest = {
  name: string;
  primaryMuscle: MuscleGroupValue;
  equipmentType: EquipmentValue;
  secondaryMuscles: MuscleGroupValue[];
};

/** `PUT /exercises/{exerciseId}/favorite`. */
export type SetFavoriteRequest = { isFavorite: boolean };

/** `PUT /me/profile`: a full replace. */
export type UpdateProfileRequest = {
  firstName: string;
  lastName: string;
  username: string;
  timeZone: string;
};

/** `PUT /me/appearance`. */
export type UpdateAppearanceRequest = { appearance: Appearance };

/** `PUT /me/tour/outcome`. */
export type TourOutcomeRequest = { outcome: TourOutcomeValue };

/** `POST /feedback` (multipart; screenshots are file parts). */
export type FeedbackRequest = {
  category: FeedbackCategoryValue;
  message: string;
};

/** `POST /me/delete`: confirmed with the current password (the web form's field). */
export type DeleteAccountRequest = { password: string };
