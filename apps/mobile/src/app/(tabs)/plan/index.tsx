import { Stack } from "expo-router";
import { Placeholder } from "../../../screens/Placeholder";

/** T3 Plan: web-only for now (Pitch 21d RD-12; 21e Checkpoint A RD-24). */
export default function PlanScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Plan", headerShown: false }} />
      <Placeholder
        eyebrow="Your training blocks"
        title="Plan"
        icon="list.bullet.rectangle"
        heading="Build and edit your plan on the web"
        message="Planning comes to the app in a later update. The workouts you plan there show up on Today here."
        webItems={[
          "Build blocks and sessions",
          "Set sets and rep ranges",
          "Import a written plan",
        ]}
        cta="Open Plan on the web"
        webPath="/plan"
        footnote="Today and History in the app always follow your active plan."
      />
    </>
  );
}
