import { Stack, useLocalSearchParams } from "expo-router";
import { parseCardioParams } from "../cardio/cardio-model";
import { CardioScreen } from "../cardio/CardioScreen";

/** C1 Cardio (Pitch 21f design §6, §15): a modal over Today or History. */
export default function CardioRoute() {
  const params = useLocalSearchParams();
  return (
    <>
      <Stack.Screen options={{ title: "Cardio" }} />
      <CardioScreen target={parseCardioParams(params)} />
    </>
  );
}
