import { Stack } from "expo-router";
import { PlanScreen } from "../../../plan/PlanScreen";

/** P1 Plan (Pitch 21h design §6, §15): read-only; the plan builder stays on the web. */
export default function PlanRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Plan", headerShown: false }} />
      <PlanScreen />
    </>
  );
}
