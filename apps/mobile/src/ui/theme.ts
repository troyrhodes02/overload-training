import {
  colors as tokenColors,
  controlHeight,
  font,
  radius,
  type ColorTokens,
} from "@overload/shared/design/tokens";
import {
  statusColors,
  type StatusColorTokens,
} from "@overload/shared/design/status-colors";
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

/**
 * The in-screen title of a tab (Pitch 21e Checkpoint A, RD-24): one native-
 * only size above the shared 2xl, between iOS body titles and its 34-point
 * large title, as on the approved design canvas. Not a shared token: the web
 * has no equivalent surface.
 */
export const screenTitleSize = { fontSize: 30, lineHeight: 36 } as const;

/**
 * A token color at an opacity, for the quiet tinted fills the design uses
 * (a saved set, a status chip). Always derived from a token, never a new
 * color; `alpha` is 0–1.
 */
export function tint(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex) return color;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${hex[1]}${a}`;
}

export function textSize(size: FontSize): {
  fontSize: number;
  lineHeight: number;
} {
  const [fontSize, lineHeight] = font.sizes[size];
  return { fontSize, lineHeight };
}

/** The shared color tokens plus the status colors kept outside tokens.ts. */
export type ThemeColors = ColorTokens & StatusColorTokens;

const THEME_COLORS: Record<Scheme, ThemeColors> = {
  light: { ...tokenColors.light, ...statusColors.light },
  dark: { ...tokenColors.dark, ...statusColors.dark },
};

export type Theme = {
  scheme: Scheme;
  colors: ThemeColors;
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
    colors: THEME_COLORS[scheme],
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
