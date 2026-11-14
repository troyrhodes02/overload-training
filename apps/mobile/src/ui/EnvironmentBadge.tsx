import { View } from "react-native";
import { ENV } from "../config/env";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

/** "Staging" (or "Local API") in every non-production build (design §6 S1). */
export function EnvironmentBadge() {
  const { colors, radius, spacing } = useTheme();
  if (!ENV.ok) return null;
  const label = ENV.config.localApi ? "Staging · local API" : "Staging";
  return (
    <View
      style={{
        alignSelf: "center",
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs,
        borderRadius: radius.md,
        backgroundColor: colors.muted,
      }}
      accessibilityLabel={`Environment: ${label}`}
    >
      <Text size="xs" weight="medium" tone="muted">
        {label}
      </Text>
    </View>
  );
}
