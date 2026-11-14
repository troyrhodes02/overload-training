import "server-only";
import type { Account } from "@/lib/data/account";
import { getWorkout } from "@/lib/logging/queries";
import { getOccurrenceProgression } from "@/lib/progression/queries";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import type { WorkoutViewDto } from "@overload/shared/contracts/views";

/**
 * The workout view (Pitch 21c spec §9.3): the workout and each card's call,
 * read by the web's workout page now and by `GET /workouts/{id}` in 21e.
 *
 * Null when the workout doesn't exist or belongs to another account (the
 * scoped read cannot tell them apart). The entitlement is resolved once and
 * every card's call goes through the GATED occurrence reader, so a Free
 * account gets `locked` and null Pro fields. Read-only.
 */
export async function getWorkoutView(
  account: Account,
  loggedSessionId: string,
): Promise<WorkoutViewDto | null> {
  const workout = await getWorkout(account, loggedSessionId);
  if (!workout) return null;
  const entitlement = await resolveEntitlement(account);
  const entries = await Promise.all(
    workout.exercises.map(async (e) => ({
      loggedExerciseId: e.loggedExerciseId,
      progression: await getOccurrenceProgression(account, e.loggedExerciseId, {
        entitlement,
      }),
    })),
  );
  return {
    workout,
    progression: entries.flatMap((e) =>
      e.progression
        ? [{ loggedExerciseId: e.loggedExerciseId, progression: e.progression }]
        : [],
    ),
  };
}
