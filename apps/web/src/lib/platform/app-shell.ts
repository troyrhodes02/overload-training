/**
 * Whether a request comes from an Overload app shell (iOS, later Android)
 * rather than a browser (OVE-112). This is the ONE place that answers it.
 *
 * Why: no purchase flow may run inside an app shell until the store billing
 * path is decided (CLAUDE.md, "Cross-platform"). The shell shows the
 * account's plan read-only and offers no way to pay, and the checkout action
 * refuses a shell request on the server, so hiding a button is never the
 * only gate.
 *
 * Contract for iOS Foundation: the Capacitor shell appends
 * `OverloadApp/<version>` to its user agent (Capacitor `appendUserAgent`).
 * A browser never sends that token, so the website behaves as before. The
 * user agent can be forged, but forging it only REMOVES purchase actions
 * from the forger's own view, so it grants nothing.
 */

export const APP_SHELL_UA_TOKEN = "OverloadApp";

const TOKEN = new RegExp(`(^|[\\s(;])${APP_SHELL_UA_TOKEN}(/|\\b)`);

/** Pure: does this user-agent string belong to an Overload app shell? */
export function isAppShellUserAgent(
  userAgent: string | null | undefined,
): boolean {
  return typeof userAgent === "string" && TOKEN.test(userAgent);
}
