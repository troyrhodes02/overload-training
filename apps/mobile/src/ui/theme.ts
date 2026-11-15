import {
  colors as tokenColors,
  controlHeight,
  font,
  radius,
  type ColorTokens,
} from "@overload/shared/design/tokens";
import type { Appearance } from "@overload/shared/appearance/appearance";

/**
 * The native theme (Pitch 21d spec §8, RD-2): a pure mapping of the shared
 * design tokens (Pitch 21b), which are the single visual authority for the
 * web and the app. The only native-only values are the 4-point spacing scale
 * and the font family names of the bundled Inter weights. No color literal
 * lives anywhere else in src/ (a guard test enforces it).
 */

export type Scheme = "light" | "dark";

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Inter, bundled with the app (no network): weight → family. */
export const fontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
} as const;
export type FontWeight = keyof typeof fontFamily;

export type FontSize = keyof typeof font.sizes;

export function textSize(size: FontSize): {
  fontSize: number;
  lineHeight: number;
} {
  const [fontSize, lineHeight] = font.sizes[size];
  return { fontSize, lineHeight };
}

export type Theme = {
  scheme: Scheme;
  colors: ColorTokens;
  radius: typeof radius;
  spacing: typeof spacing;
  controlHeight: typeof controlHeight;
  /** Primary buttons on account screens: 44 + 4 for thumb reach (design §3). */
  primaryButtonHeight: number;
  /** The token overlay (rgba black at 50%). */
  overlay: string;
};

export function buildTheme(scheme: Scheme): Theme {
  return {
    scheme,
    colors: tokenColors[scheme],
    radius,
    spacing,
    controlHeight,
    primaryButtonHeight: controlHeight.lg + 4,
    overlay: "rgba(0, 0, 0, 0.5)",
  };
}

/** The account preference over the device setting (design §3, RD-10). */
export function resolveScheme(
  preference: Appearance,
  system: Scheme | null | undefined,
): Scheme {
  if (preference === "light" || preference === "dark") return preference;
  return system === "dark" ? "dark" : "light";
}
