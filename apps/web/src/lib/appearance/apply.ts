import {
  APPEARANCE_STORAGE_KEY,
  THEME_COLORS,
  type Appearance,
} from "./appearance";

/**
 * Applies an appearance to the document (spec §7.3). `light`/`dark` put that
 * class on <html>, which the tokens in globals.css already understand; System
 * removes both, so the `prefers-color-scheme` rules decide — live, as the
 * device changes. The browser chrome color follows, and the choice is mirrored
 * to this device for the next first paint. Transitions are suspended for the
 * switch so no surface fades between themes. Idempotent.
 *
 * Client-only: a no-op where there is no document. The `doc` and `storage`
 * parameters exist for tests.
 */
export function applyAppearance(
  appearance: Appearance,
  doc: Document | undefined = typeof document === "undefined"
    ? undefined
    : document,
  storage: () => Storage | undefined = () =>
    typeof localStorage === "undefined" ? undefined : localStorage,
): void {
  if (!doc) return;

  const freeze = doc.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  doc.head.appendChild(freeze);

  const root = doc.documentElement;
  root.classList.toggle("dark", appearance === "dark");
  root.classList.toggle("light", appearance === "light");

  for (const meta of Array.from(
    doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  )) {
    const media = meta.getAttribute("media") ?? "";
    const color =
      appearance === "system"
        ? media.includes("dark")
          ? THEME_COLORS.dark
          : THEME_COLORS.light
        : THEME_COLORS[appearance];
    meta.setAttribute("content", color);
  }

  try {
    storage()?.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    // Storage can be unavailable (private mode, blocked site data): the mirror
    // is only a first-paint convenience, so the switch still stands.
  }

  // Force a style flush with transitions off, then restore them.
  void root.offsetHeight;
  setTimeout(() => freeze.remove(), 0);
}
