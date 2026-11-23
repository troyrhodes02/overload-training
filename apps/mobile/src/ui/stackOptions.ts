import type { Stack } from "expo-router";
import { fontFamily, textSize } from "./theme";
import type { Theme } from "./theme";

type ScreenOptions = Exclude<
  NonNullable<React.ComponentProps<typeof Stack>["screenOptions"]>,
  (...args: never[]) => unknown
>;

/**
 * Native stack header styling from the tokens (design §15).
 *
 * Always the standard inline title. Tab roots draw their own header and hide
 * this one (21e RD-24), so the only screens that ever showed the native large
 * title were pushed ones, and on the device it rendered as an empty band
 * above their content (21e RD-24: "configured but not rendering"; Pitch 21h
 * OVE-237). Don't turn it back on per stack.
 */
export function stackScreenOptions(theme: Theme): ScreenOptions {
  const { colors } = theme;
  return {
    headerLargeTitle: false,
    headerLargeTitleShadowVisible: false,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerLargeTitleStyle: {
      fontFamily: fontFamily.semibold,
      color: colors.foreground,
    },
    headerTitleStyle: {
      fontFamily: fontFamily.semibold,
      fontSize: textSize("base").fontSize,
      color: colors.foreground,
    },
    headerTintColor: colors.primary,
    headerBackButtonDisplayMode: "minimal",
    contentStyle: { backgroundColor: colors.background },
  };
}
