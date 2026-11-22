import { Pressable, View } from "react-native";
import { haptic } from "./haptics";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

/**
 * A two-or-three-way switch, as iOS's segmented control (Pitch 21h design L1:
 * All / Favorites). Each segment is a 44-point button with its selected state.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, radius, spacing, controlHeight } = useTheme();
  return (
    <View
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        backgroundColor: colors.secondary,
        borderRadius: radius.lg,
        padding: 2,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              void haptic.selection();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              minHeight: controlHeight.touchMin - 4,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.md,
              paddingHorizontal: spacing.sm,
              backgroundColor: on ? colors.card : "transparent",
            }}
          >
            <Text size="sm" weight="medium" tone={on ? "default" : "muted"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
