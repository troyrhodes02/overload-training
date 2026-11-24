import { useLocalSearchParams } from "expo-router";
import { ExerciseScreen } from "../../../../library/ExerciseScreen";

/** X1 Exercise, from the library (Pitch 21h design §6). */
export default function LibraryExerciseRoute() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  return (
    <ExerciseScreen
      exerciseId={String(exerciseId)}
      context="browse"
      stack="more"
    />
  );
}
