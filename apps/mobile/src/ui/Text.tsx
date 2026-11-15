import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { fontFamily, textSize, type FontSize, type FontWeight } from "./theme";
import { useTheme } from "./ThemeProvider";

export type TextTone =
  "default" | "muted" | "primary" | "destructive" | "inverse";

export type TextProps = RNTextProps & {
  size?: FontSize;
  weight?: FontWeight;
  tone?: TextTone;
  align?: "left" | "center" | "right";
};

/**
 * Inter at a token size and weight (design §3). The weight picks the bundled
 * family, so iOS never synthesizes a bold. Numbers are always tabular.
 */
export function Text({
  size = "base",
  weight = "regular",
  tone = "default",
  align,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const color = {
    default: colors.foreground,
    muted: colors.mutedForeground,
    primary: colors.primary,
    destructive: colors.destructive,
    inverse: colors.primaryForeground,
  }[tone];
  return (
    <RNText
      {...rest}
      style={[
        {
          ...textSize(size),
          fontFamily: fontFamily[weight],
          color,
          fontVariant: ["tabular-nums"],
          textAlign: align,
        },
        style,
      ]}
    />
  );
}
