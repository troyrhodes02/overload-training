import { useLocalSearchParams } from "expo-router";
import { LoggedWorkoutScreen } from "../../../../history/LoggedWorkoutScreen";

/**
 * H2 Logged workout in the plan stack (Pitch 21i RD-12): a session opened
 * from an exercise's history, so back returns to that history.
 */
export default function LoggedWorkoutInStackRoute() {
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
