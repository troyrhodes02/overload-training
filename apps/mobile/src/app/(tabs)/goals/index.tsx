import { Stack } from "expo-router";
import { Placeholder } from "../../../screens/Placeholder";

export default function GoalsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Goals" }} />
      <Placeholder
        icon="target"
        title="Goals come to the app in a later update."
        message="Set and track your goals on the web now."
      />
    </>
  );
}
