import { Stack } from "expo-router";
import { Placeholder } from "../../../screens/Placeholder";
import { accountTodayLabel } from "../../../today/date";
import { Text } from "../../../ui/Text";
import { useAccountTimeZone } from "../../../app-state/account";

export default function TodayScreen() {
  const timeZone = useAccountTimeZone();
  return (
    <>
      <Stack.Screen options={{ title: "Today" }} />
      <Placeholder
        header={
          <Text tone="muted" accessibilityRole="text">
            {accountTodayLabel(timeZone)}
          </Text>
        }
        icon="sun.max"
        title="Workout logging is coming to the app next."
        message="For now, log today's training on the web."
      />
    </>
  );
}
