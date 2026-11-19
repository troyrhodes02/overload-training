import {
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { Text } from "./Text";
import { tint } from "./theme";
import { useTheme } from "./ThemeProvider";

/**
 * The one card surface (Pitch 21e Checkpoint A, RD-24): the card color, the
 * token border (so a card separates from the background in dark), and the xl
 * radius. `tone="attention"` outlines a card that needs the lifter (a missed
 * workout); nothing else changes color.
 */
export function Surface({
  tone = "default",
  padded = true,
  style,
  ...rest
}: ViewProps & {
  tone?: "default" | "attention";
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: tone === "attention" ? colors.attention : colors.border,
          padding: padded ? spacing.lg : 0,
          overflow: padded ? undefined : "hidden",
        },
        style,
      ]}
    />
  );
}

export type ChipTone =
  | "primary"
  | "muted"
  | "attention"
  | "progress"
  /** A reactive Deload and a stalled lift (Pitch 21g), never a deload week. */
  | "deload";

/** A small status chip: "Ready", "Done", "Skipped" (always words, never color alone). */
export function Chip({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: ChipTone;
}) {
  const { colors, spacing } = useTheme();
  const color =
    tone === "primary"
      ? colors.primary
      : tone === "attention"
        ? colors.attention
        : tone === "progress"
          ? colors.progress
          : tone === "deload"
            ? colors.deload
            : colors.mutedForeground;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor:
          tone === "muted" ? colors.secondary : tint(color, 0.14),
      }}
    >
      <Text size="xs" weight="medium" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
