import { Pressable, View } from "react-native";
import {
  RIR_VALUES,
  formatRir,
  rirAccessibleName,
} from "@overload/shared/logging/rir";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

/**
 * The optional reps-in-reserve choice (Pitch 21f design §6; RD-8): five chips
 * `0 1 2 3 4+` from the shared scale. Nothing is selected to begin with, a tap
 * selects, and a tap on the selected chip clears it. `null` means "not
 * recorded" and is never 0. The selected chip is a neutral fill, never the
 * primary color: RIR is a note beside the set, not the action.
 *
 * A chip is a Pressable, not an input, so pressing one never takes focus from
 * the weight or reps field and the keyboard stays where it is.
 */
export function RirPicker({
  value,
  onChange,
  setNumber,
  showLabel = true,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  /** For each chip's spoken name: "Set 2 RIR 1". */
  setNumber: number;
  /** The muted "RIR" prefix on the card; the edit sheet has its own heading. */
  showLabel?: boolean;
  disabled?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: spacing.sm,
      }}
    >
      {showLabel ? (
        <Text
          size="sm"
          tone="muted"
          style={{ width: 48 }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          RIR
        </Text>
      ) : null}
      {RIR_VALUES.map((r) => {
        const selected = value === r;
        return (
          <Pressable
            key={r}
            accessibilityRole="button"
            accessibilityLabel={`Set ${setNumber} RIR ${rirAccessibleName(r)}`}
            accessibilityHint={
              selected
                ? "Reps in reserve. Tap to clear."
                : "Reps in reserve, optional."
            }
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(selected ? null : r)}
            style={({ pressed }) => ({
              minWidth: 44,
              minHeight: 44,
              paddingHorizontal: spacing.sm,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.lg,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? colors.foreground : colors.input,
              backgroundColor: selected ? colors.accent : colors.card,
              opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
            })}
          >
            <Text weight="medium" tone={selected ? "default" : "muted"}>
              {formatRir(r)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
