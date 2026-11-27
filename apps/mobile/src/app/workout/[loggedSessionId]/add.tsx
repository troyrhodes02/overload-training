import { Stack, useLocalSearchParams } from "expo-router";
import { WING_IT_COPY } from "@overload/shared/logging/wing-it";
import { AddExerciseScreen } from "../../../workout/AddExerciseScreen";

/** Add an exercise (Pitch 25 design §6.8, §15): a modal over a Wing-It workout. */
export default function AddExerciseRoute() {
  const { loggedSessionId } = useLocalSearchParams<{
    loggedSessionId: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: WING_IT_COPY.pickerTitle }} />
      <AddExerciseScreen loggedSessionId={String(loggedSessionId)} />
    </>
  );
}
