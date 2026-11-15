import { Stack } from "expo-router";
import { HistoryScreen } from "../../../history/HistoryScreen";

/** H1 History (Pitch 21e design §6, §15): all-time, week by week. */
export default function HistoryRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "History" }} />
      <HistoryScreen />
    </>
  );
}
