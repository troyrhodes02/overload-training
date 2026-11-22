import { useLocalSearchParams } from "expo-router";
import { SessionScreen } from "../../../../plan/SessionScreen";

/** P2 Session (Pitch 21h design §6, §15): pushed from Plan. */
export default function PlanSessionRoute() {
  const { sessionId, mesocycleId } = useLocalSearchParams<{
    sessionId: string;
    mesocycleId?: string;
  }>();
  return (
    <SessionScreen
      mesocycleId={String(mesocycleId ?? "")}
      sessionId={String(sessionId)}
      exerciseHref={null}
    />
  );
}
