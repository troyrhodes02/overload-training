import { useLocalSearchParams } from "expo-router";
import { ExerciseScreen } from "../../../../library/ExerciseScreen";

/** X1 Exercise in the Goals stack (Pitch 21i design §4). */
export default function GoalsExerciseRoute() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  return (
    <ExerciseScreen
      exerciseId={String(exerciseId)}
      context="browse"
      stack="goals"
    />
  );
}
