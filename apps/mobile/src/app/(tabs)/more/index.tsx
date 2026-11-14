import { router, Stack } from "expo-router";
import { ScrollView } from "react-native";
import { APP_VERSION, ENV } from "../../../config/env";
import { GroupedList, ListRow } from "../../../ui/GroupedList";
import { Text } from "../../../ui/Text";
import { useTheme } from "../../../ui/ThemeProvider";

export default function MoreScreen() {
  const { colors, spacing } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: "More" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
      >
        <MoreFooter />
        {ENV.ok ? (
          <GroupedList>
            <ListRow
              title="Diagnostics"
              accessory="chevron"
              onPress={() => router.push("/more/diagnostics")}
            />
          </GroupedList>
        ) : null}
      </ScrollView>
    </>
  );
}

export function MoreFooter() {
  return (
    <Text size="xs" tone="muted" align="center">
      {`Overload ${APP_VERSION} · Staging`}
    </Text>
  );
}
