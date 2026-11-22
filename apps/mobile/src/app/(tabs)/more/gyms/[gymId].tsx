import { useLocalSearchParams } from "expo-router";
import { GymScreen } from "../../../../gyms/GymScreen";

/** G2 Gym (Pitch 21h design §6, §15). */
export default function GymRoute() {
  const { gymId } = useLocalSearchParams<{ gymId: string }>();
  return <GymScreen gymId={String(gymId)} />;
}
