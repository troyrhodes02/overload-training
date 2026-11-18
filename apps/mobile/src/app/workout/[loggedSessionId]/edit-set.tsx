import { Stack, useLocalSearchParams } from "expo-router";
import { EditSetScreen } from "../../../workout/EditSetScreen";

/** E1 Edit set (Pitch 21f design §6, §15): a modal over its opener. */
export default function EditSetRoute() {
  const { loggedSessionId, loggedSetId, from } = useLocalSearchParams<{
    loggedSessionId: string;
    loggedSetId: string;
    from: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: "Edit set" }} />
      <EditSetScreen
        loggedSessionId={String(loggedSessionId)}
        loggedSetId={String(loggedSetId)}
        from={from === "history" ? "history" : "workout"}
      />
    </>
  );
}
