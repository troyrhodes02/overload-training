import { Pressable, ScrollView, View } from "react-native";
import { haptic } from "./haptics";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export type ChipOption<T extends string> = { value: T; label: string };

/**
 * Selectable chips (Pitch 21h design §10): one choice or several, wrapping or
 * in one horizontal row. Every option is a 44-point button with its selected
 * state, so VoiceOver reads the group as choices. Used for the library's
 * muscle filter and the new-exercise form.
 */
export function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
  layout = "wrap",
  disabled = false,
}: {
  /** The group's accessible name ("Primary muscle"). */
  label: string;
  options: readonly ChipOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  layout?: "wrap" | "row";
  disabled?: boolean;
}) {
  const { colors, spacing, controlHeight } = useTheme();
  const chips = options.map((o) => {
    const on = selected.includes(o.value);
    return (
      <Pressable
        key={o.value}
        accessibilityRole="button"
        accessibilityLabel={o.label}
        accessibilityState={{ selected: on, disabled }}
        disabled={disabled}
        onPress={() => {
          void haptic.selection();
          onToggle(o.value);
        }}
        style={({ pressed }) => ({
          minHeight: controlHeight.touchMin,
          justifyContent: "center",
          paddingHorizontal: spacing.md,
          borderRadius: 999,
          backgroundColor: on ? colors.primary : colors.secondary,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        })}
      >
        <Text size="sm" weight="medium" tone={on ? "inverse" : "default"}>
          {o.label}
        </Text>
      </Pressable>
    );
  });
  if (layout === "row") {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={label}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {chips}
      </ScrollView>
    );
  }
  return (
    <View
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
    >
      {chips}
    </View>
  );
}
