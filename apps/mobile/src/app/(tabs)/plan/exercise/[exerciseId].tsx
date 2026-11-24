import { useLocalSearchParams } from "expo-router";
import { ExerciseScreen } from "../../../../library/ExerciseScreen";

/** X1 Exercise, from a planned session (Pitch 21h design §6). */
export default function PlanExerciseRoute() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  return (
    <ExerciseScreen
      exerciseId={String(exerciseId)}
      context="browse"
      stack="plan"
    />
  );
}
