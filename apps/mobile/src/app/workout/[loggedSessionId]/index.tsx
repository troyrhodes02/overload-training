import { Stack, useLocalSearchParams } from "expo-router";
import { WorkoutScreen } from "../../../workout/WorkoutScreen";

/** W1 Workout (Pitch 21e design §6, §15). */
export default function WorkoutRoute() {
  const { loggedSessionId } = useLocalSearchParams<{
    loggedSessionId: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: "Workout" }} />
      <WorkoutScreen loggedSessionId={String(loggedSessionId)} />
    </>
  );
}
