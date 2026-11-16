import { Stack } from "expo-router";
import { TodayView } from "../../../today/TodayView";

/** T1 Today (Pitch 21e design §6, §15): the real dashboard. */
export default function TodayScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Today", headerShown: false }} />
      <TodayView />
    </>
  );
}
