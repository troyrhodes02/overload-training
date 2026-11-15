import { useLocalSearchParams } from "expo-router";
import { SummaryScreen } from "../../../workout/SummaryScreen";

/** S1 Summary (Pitch 21e design §6, §15). */
export default function SummaryRoute() {
  const { loggedSessionId } = useLocalSearchParams<{
    loggedSessionId: string;
  }>();
  return <SummaryScreen loggedSessionId={String(loggedSessionId)} />;
}
