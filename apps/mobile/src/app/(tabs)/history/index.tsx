import { Stack } from "expo-router";
import { Placeholder } from "../../../screens/Placeholder";

export default function HistoryScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "History" }} />
      <Placeholder
        icon="clock.arrow.circlepath"
        title="History comes to the app in a later update."
        message="Every workout you've logged is on the web now."
      />
    </>
  );
}
