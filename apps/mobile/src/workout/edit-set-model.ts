import type {
  LoggedWorkoutDetailDto,
  WorkoutDto,
} from "@overload/shared/contracts/logging";
import type { EditLoggedSetRequest } from "@overload/shared/contracts/requests";

/** One saved set as the edit sheet needs it: the server's stored values. */
export type EditableSet = {
  loggedSetId: string;
  setNumber: number;
  exerciseName: string;
  /** False for a bodyweight lift: reps only, and no weight is ever sent. */
  requiresExternalWeight: boolean;
  weightLbs: number | null;
  reps: number;
  /** Null: not recorded (never 0). */
  rir: number | null;
  /** The workout's date when opened from History; null from the workout. */
  dateIso: string | null;
};

/**
 * The stored set to correct, from the read the opening screen already holds:
 * the workout (its cards) or the logged workout (its record). Null when that
 * read has no such saved set. No I/O, and nothing here is a training rule.
 */
export function findEditableSet(
  source: WorkoutDto | LoggedWorkoutDetailDto,
  loggedSetId: string,
): EditableSet | null {
  if ("status" in source) {
    for (const card of source.exercises) {
      const set = card.sets.find(
        (s) => s.saved && s.loggedSetId === loggedSetId && s.reps !== null,
      );
      if (set) {
        return {
          loggedSetId,
          setNumber: set.setNumber,
          exerciseName: card.performedExerciseName,
          requiresExternalWeight: card.requiresExternalWeight,
          weightLbs: set.weightLbs,
          reps: set.reps as number,
          rir: set.rir,
          dateIso: null,
        };
      }
    }
    return null;
  }
  for (const exercise of source.exercises) {
    const set = exercise.sets.find((s) => s.loggedSetId === loggedSetId);
    if (set) {
      return {
        loggedSetId,
        setNumber: set.setNumber,
        exerciseName: exercise.performedName,
        requiresExternalWeight: exercise.requiresExternalWeight,
        weightLbs: set.weightLbs,
        reps: set.reps,
        rir: set.rir,
        dateIso: source.dateIso,
      };
    }
  }
  return null;
}

/**
 * The correction to send (Pitch 21f RD-9, RD-15). A bodyweight lift sends no
 * weight at all. `rir` is sent only when the lifter changed it (null when
 * cleared), so correcting a weight can never erase a stored RIR.
 */
export function editSetBody(
  original: Pick<EditableSet, "requiresExternalWeight" | "rir">,
  draft: { weightLbs: number | null; reps: number; rir: number | null },
): EditLoggedSetRequest {
  return {
    ...(original.requiresExternalWeight ? { weightLbs: draft.weightLbs } : {}),
    reps: draft.reps,
    ...(draft.rir !== original.rir ? { rir: draft.rir } : {}),
  };
}

/** Has anything the sheet can change been changed? */
export function editSetChanged(
  original: Pick<
    EditableSet,
    "requiresExternalWeight" | "weightLbs" | "reps" | "rir"
  >,
  draft: { weightLbs: number; reps: number; rir: number | null },
): boolean {
  return (
    draft.reps !== original.reps ||
    draft.rir !== original.rir ||
    (original.requiresExternalWeight && draft.weightLbs !== original.weightLbs)
  );
}
