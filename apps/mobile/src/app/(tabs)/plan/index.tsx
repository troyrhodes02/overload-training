import { Stack } from "expo-router";
import { Placeholder } from "../../../screens/Placeholder";

export default function PlanScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Plan" }} />
      <Placeholder
        icon="list.bullet.rectangle"
        title="Your plan comes to the app in a later update."
        message="Build and edit your split on the web."
      />
    </>
  );
}
