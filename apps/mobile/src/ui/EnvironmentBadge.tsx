import { View } from "react-native";
import { ENV, ENVIRONMENT_LABEL } from "../config/env";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

/**
 * "Staging" (or "Staging · local API") in every non-production build (design
 * §6 S1). The Production build shows nothing (21l design §11).
 */
export function EnvironmentBadge() {
  const { colors, radius, spacing } = useTheme();
  if (!ENV.ok || ENV.config.environment === "production") return null;
  const label = ENVIRONMENT_LABEL;
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
