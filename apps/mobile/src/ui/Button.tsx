import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export type ButtonVariant =
  "primary" | "secondary" | "text" | "destructive-text";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  /** Primary account actions are 48 tall (design §3); others 44. */
  size?: "md" | "lg";
  style?: StyleProp<ViewStyle>;
};

/** One button for the app: primary, secondary, and text variants (design §10). */
export function Button({
  label,
  variant = "primary",
  loading = false,
  size = "lg",
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const { colors, radius } = theme;
  const isDisabled = disabled || loading;
  const filled = variant === "primary" || variant === "secondary";
  const background =
    variant === "primary"
      ? colors.primary
      : variant === "secondary"
        ? colors.secondary
        : "transparent";
  const tone =
    variant === "primary"
      ? "inverse"
      : variant === "destructive-text"
        ? "destructive"
        : variant === "text"
          ? "primary"
          : "default";
  const height =
    size === "lg" && filled
      ? theme.primaryButtonHeight
      : theme.controlHeight.touchMin;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={filled ? undefined : 4}
      style={({ pressed }) => [
        {
          minHeight: height,
          borderRadius: radius.lg,
          backgroundColor: background,
          paddingHorizontal: filled ? 16 : 4,
          alignItems: "center",
          justifyContent: "center",
          opacity: isDisabled ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}
      {...rest}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={
              variant === "primary"
                ? colors.primaryForeground
                : colors.mutedForeground
            }
          />
        ) : null}
        <Text weight="medium" tone={tone}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
