/**
 * Status colors added after the native build (Pitch 21e Checkpoint A, RD-25),
 * kept apart from tokens.ts on purpose: the app's native config imports
 * tokens.ts for the splash background, so Expo's runtime fingerprint hashes
 * that file, and any edit to it cuts the installed build off from
 * over-the-air updates. Values here are still the shared authority: the
 * native theme merges them into its colors, and the web parity test
 * (apps/web/tests/unit/design-tokens.test.ts) keeps globals.css equal to
 * tokens.ts plus this file.
 *
 * Move these into ColorTokens at the next native rebuild.
 */

export type StatusColorTokens = {
  /**
   * A scheduling problem that needs the lifter, such as a missed workout.
   * Never decoration, never a second brand accent; text, icons, and outlines
   * only, AA on card and background in both appearances.
   */
  attention: string;
};

export const statusColors: {
  readonly light: StatusColorTokens;
  readonly dark: StatusColorTokens;
} = {
  light: { attention: "#a15c00" },
  dark: { attention: "#e0a33a" },
};
