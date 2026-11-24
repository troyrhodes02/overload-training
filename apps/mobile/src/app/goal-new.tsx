import { useLocalSearchParams } from "expo-router";
import { NewGoalScreen } from "../goals/NewGoalScreen";

/** G5 Set goal (Pitch 21i design §6): a modal over everything. */
export default function NewGoalRoute() {
  const { exerciseId, gymId, from } = useLocalSearchParams<{
    exerciseId?: string;
    gymId?: string;
    from?: string;
  }>();
  return (
    <NewGoalScreen
      exerciseId={String(exerciseId ?? "")}
      gymId={typeof gymId === "string" && gymId ? gymId : null}
      from={from === "history" || from === "workout" ? from : "goals"}
    />
  );
}
