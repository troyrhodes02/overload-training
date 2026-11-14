import { View } from "react-native";
import { Symbol } from "./Symbol";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

/** An inline message above an action (design §8): never a floating toast. */
export function Banner({
  tone = "error",
  message,
}: {
  tone?: "error" | "info";
  message: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const error = tone === "error";
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        gap: spacing.sm,
        alignItems: "flex-start",
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: error ? colors.destructive : colors.border,
        backgroundColor: error ? colors.card : colors.muted,
      }}
    >
      <Symbol
        name={error ? "exclamationmark.triangle" : "info.circle"}
        size={18}
        color={error ? colors.destructive : colors.mutedForeground}
      />
      <Text
        size="sm"
        tone={error ? "destructive" : "muted"}
        style={{ flex: 1 }}
      >
        {message}
      </Text>
    </View>
  );
}
