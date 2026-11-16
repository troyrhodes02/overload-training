import { Stack } from "expo-router";
import { Placeholder } from "../../../screens/Placeholder";

/** T4 Goals: web-only for now (Pitch 21d RD-12; 21e Checkpoint A RD-24). */
export default function GoalsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Goals", headerShown: false }} />
      <Placeholder
        eyebrow="Strength targets"
        title="Goals"
        icon="target"
        heading="Set and track goals on the web"
        message="Goals come to the app in a later update. Everything you log here already counts toward them."
        webItems={[
          "Set a weight and reps target",
          "See progress toward each goal",
          "Look back at goals you reached",
        ]}
        cta="Open Goals on the web"
        webPath="/goals"
        footnote="Your goals stay in your account. Nothing is lost while the app catches up."
      />
    </>
  );
}
