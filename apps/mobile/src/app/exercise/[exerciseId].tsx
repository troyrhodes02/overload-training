import { useLocalSearchParams } from "expo-router";
import { ExerciseScreen } from "../../library/ExerciseScreen";

/**
 * X1 Exercise over a workout (Pitch 21h RD-13): on the root stack, so the
 * workout underneath stays mounted with everything typed. No archive, no
 * swap, no write to the workout.
 */
export default function WorkoutExerciseRoute() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  return (
    <ExerciseScreen
      exerciseId={String(exerciseId)}
      context="workout"
      stack="root"
    />
  );
}
