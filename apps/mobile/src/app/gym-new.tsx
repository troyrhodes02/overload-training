import { useLocalSearchParams } from "expo-router";
import { NewGymScreen } from "../gyms/NewGymScreen";

/**
 * G3 New gym (Pitch 21h design §6): a modal over Gyms or Today. From Today
 * the new gym is used by the next Start, so no list notice is left behind.
 */
export default function NewGymRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return <NewGymScreen notify={from !== "today"} />;
}
