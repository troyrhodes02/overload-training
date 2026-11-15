import type { Stack } from "expo-router";
import { fontFamily, textSize } from "./theme";
import type { Theme } from "./theme";

type ScreenOptions = Exclude<
  NonNullable<React.ComponentProps<typeof Stack>["screenOptions"]>,
  (...args: never[]) => unknown
>;

/** Native stack header styling from the tokens (design §15). */
export function stackScreenOptions(
  theme: Theme,
  opts: { largeTitle?: boolean } = {},
): ScreenOptions {
  const { colors } = theme;
  return {
    headerLargeTitle: opts.largeTitle ?? false,
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
