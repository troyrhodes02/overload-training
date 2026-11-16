/**
 * Overload's design tokens as plain values (Pitch 21b; mobile audit §6), for
 * the iPhone app to use and for the web to check itself against. The web keeps
 * styling with Tailwind and shadcn/ui from apps/web/src/app/globals.css; a
 * test (apps/web/tests/unit/design-tokens.test.ts) keeps that file and these
 * values equal, so a color changed in one place and not the other fails.
 *
 * Values only: no CSS, no React, no platform style objects. Lengths are
 * density-independent pixels (CSS px on the web, points on iOS).
 */

/** The semantic color tokens of one appearance (globals.css custom properties). */
export type ColorTokens = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  /** Status: ready to go up (progress tag). */
  progress: string;
  /** Status: deload, and a stalled lift. */
  deload: string;
};

export const colors: {
  readonly light: ColorTokens;
  readonly dark: ColorTokens;
} = {
  light: {
    background: "#f7f7f8",
    foreground: "#0e0e10",
    card: "#ffffff",
    cardForeground: "#0e0e10",
    popover: "#ffffff",
    popoverForeground: "#0e0e10",
    primary: "#0159fd",
    primaryForeground: "#ffffff",
    secondary: "#ececed",
    secondaryForeground: "#0e0e10",
    muted: "#ececed",
    mutedForeground: "#5f5f68",
    accent: "#ececed",
    accentForeground: "#0e0e10",
    destructive: "#b42318",
    destructiveForeground: "#ffffff",
    border: "#e4e4e8",
    input: "#e4e4e8",
    ring: "#0159fd",
    progress: "#2f9e6b",
    deload: "#b7791f",
  },
  dark: {
    background: "#0b0b0c",
    foreground: "#f2f2f3",
    card: "#141416",
    cardForeground: "#f2f2f3",
    popover: "#1c1c1f",
    popoverForeground: "#f2f2f3",
    primary: "#1a66ff",
    primaryForeground: "#ffffff",
    secondary: "#1c1c1f",
    secondaryForeground: "#f2f2f3",
    muted: "#1c1c1f",
    mutedForeground: "#a1a1a8",
    accent: "#1c1c1f",
    accentForeground: "#f2f2f3",
    destructive: "#e5484d",
    destructiveForeground: "#0b0b0c",
    border: "#26262a",
    input: "#26262a",
    ring: "#2f7bff",
    progress: "#4cc38a",
    deload: "#e0a93b",
  },
};

/** Corner radii: the web's `--radius` (8) and its sm/md/xl steps. */
export const radius = { sm: 4, md: 6, lg: 8, xl: 12 } as const;

/** Inter, three weights only; sizes as [font size, line height]. */
export const font = {
  family: "Inter",
  weights: { regular: 400, medium: 500, semibold: 600 },
  sizes: {
    xs: [12, 16],
    sm: [14, 20],
    base: [16, 24],
    lg: [18, 28],
    xl: [20, 28],
    "2xl": [24, 32],
  },
  /** Every number uses tabular figures. */
  tabularNumerals: true,
} as const;

/** Control heights (button sm/default/lg, input) and the minimum touch target. */
export const controlHeight = { sm: 36, md: 40, lg: 44, touchMin: 44 } as const;

/** The scrim behind dialogs and sheets. */
export const overlay = "rgba(0, 0, 0, 0.5)";

/** The one in-app chart (exercise trend): token names, not colors. */
export const chart = {
  grid: "border",
  axis: "mutedForeground",
  axisFontSize: 11,
  series: "primary",
  secondarySeries: "mutedForeground",
} as const satisfies Record<string, keyof ColorTokens | number>;
