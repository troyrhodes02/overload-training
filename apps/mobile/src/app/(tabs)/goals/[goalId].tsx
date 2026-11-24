import { useLocalSearchParams } from "expo-router";
import { GoalScreen } from "../../../goals/GoalScreen";

/** G3 Goal (Pitch 21i design §6). */
export default function GoalRoute() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  return <GoalScreen goalId={String(goalId)} />;
}
