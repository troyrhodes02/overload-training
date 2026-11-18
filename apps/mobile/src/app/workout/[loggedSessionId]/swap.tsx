import { Stack, useLocalSearchParams } from "expo-router";
import { SwapScreen } from "../../../workout/SwapScreen";

/** X1 Swap exercise (Pitch 21f design §6, §15): a modal over the workout. */
export default function SwapRoute() {
  const { loggedSessionId, loggedExerciseId } = useLocalSearchParams<{
    loggedSessionId: string;
    loggedExerciseId: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: "Swap exercise" }} />
      <SwapScreen
        loggedSessionId={String(loggedSessionId)}
        loggedExerciseId={String(loggedExerciseId)}
      />
    </>
  );
}
