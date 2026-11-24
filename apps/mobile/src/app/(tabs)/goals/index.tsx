import { Stack } from "expo-router";
import { GoalsScreen } from "../../../goals/GoalsScreen";

/** T4 Goals (Pitch 21i design G1): replaces the 21d placeholder. */
export default function GoalsTab() {
  return (
    <>
      <Stack.Screen options={{ title: "Goals", headerShown: false }} />
      <GoalsScreen />
    </>
  );
}
