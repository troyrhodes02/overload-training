/**
 * The appearance preference (Personalization & Navigation Polish, spec §7.3).
 * Pure values only — no React, no Prisma, no `server-only` — so the Settings
 * island, the shell, the root layout, and the server all share one
 * definition. The stored value lives on the account (Profile.appearance).
 */

export const APPEARANCES = ["system", "light", "dark"] as const;
export type Appearance = (typeof APPEARANCES)[number];

/** What an account that never chose sees: follow the device. */
export const DEFAULT_APPEARANCE: Appearance = "system";

export function isAppearance(value: unknown): value is Appearance {
  return (
    typeof value === "string" &&
    (APPEARANCES as readonly string[]).includes(value)
  );
}

/**
 * The per-device first-paint mirror (spec R6): the last appearance applied on
 * this device. Written only from the account's stored value or a choice just
 * made in Settings, read only by the boot script. Never authoritative.
 */
export const APPEARANCE_STORAGE_KEY = "overload.appearance";

/**
 * Browser chrome colors per mode — the theme's `--background` values. The
 * root layout's viewport `themeColor` and the appearance applier both read
 * these, so they cannot drift apart.
 */
export const THEME_COLORS = {
  light: "#f7f7f8",
  dark: "#0b0b0c",
} as const;
