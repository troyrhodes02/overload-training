import { useLocalSearchParams } from "expo-router";
import { LoggedWorkoutScreen } from "../../../history/LoggedWorkoutScreen";

/** H2 Logged workout (Pitch 21e design §6, §15). */
export default function LoggedWorkoutRoute() {
  const { loggedSessionId, inProgress } = useLocalSearchParams<{
    loggedSessionId: string;
    inProgress?: string;
  }>();
  return (
    <LoggedWorkoutScreen
      loggedSessionId={String(loggedSessionId)}
      inProgress={inProgress === "1"}
    />
  );
}
