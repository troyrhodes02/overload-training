import { useLocalSearchParams } from "expo-router";
import { NewExerciseScreen } from "../library/NewExerciseScreen";

/** L2 New exercise (Pitch 21h design §6, §15): a modal over the library. */
export default function NewExerciseRoute() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return (
    <NewExerciseScreen initialName={typeof name === "string" ? name : ""} />
  );
}
