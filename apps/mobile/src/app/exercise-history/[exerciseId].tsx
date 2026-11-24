import { useLocalSearchParams } from "expo-router";
import { ExerciseHistoryScreen } from "../../exercise-history/ExerciseHistoryScreen";

/**
 * X2 Exercise history over a workout (Pitch 21i RD-12): on the root stack,
 * so the workout underneath stays mounted with everything typed. Session
 * dates aren't links here: no second workout's editor over the live one.
 */
export default function WorkoutExerciseHistoryRoute() {
  const { exerciseId, scope } = useLocalSearchParams<{
    exerciseId: string;
    scope?: string;
  }>();
  return (
    <ExerciseHistoryScreen
      exerciseId={String(exerciseId)}
      initialScope={typeof scope === "string" && scope ? scope : null}
      stack="root"
    />
  );
}
