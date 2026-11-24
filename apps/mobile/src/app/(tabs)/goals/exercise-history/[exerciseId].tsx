import { useLocalSearchParams } from "expo-router";
import { ExerciseHistoryScreen } from "../../../../exercise-history/ExerciseHistoryScreen";

/** X2 Exercise history in the goals stack (Pitch 21i design §6, RD-12). */
export default function ExerciseHistoryRoute() {
  const { exerciseId, scope } = useLocalSearchParams<{
    exerciseId: string;
    scope?: string;
  }>();
  return (
    <ExerciseHistoryScreen
      exerciseId={String(exerciseId)}
      initialScope={typeof scope === "string" && scope ? scope : null}
      stack="goals"
    />
  );
}
