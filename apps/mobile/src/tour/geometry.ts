import type { Rect } from "./types";

/**
 * The native tour's geometry (Pitch 21k spec §5.3). Pure functions of
 * rectangles in window points: where the screen's content is visible, whether
 * a measured target is usable, how far to scroll it into view, the spotlight
 * around it, and where the card goes.
 */

/**
 * Room kept free above the bottom safe area for the tab bar (UITabBar is 49
 * pt; the iOS 26 floating bar sits a little higher). Conservative on purpose:
 * it only decides when to scroll and where a card may sit.
 */
export const TAB_BAR_CLEARANCE = 64;
/** The spotlight extends this far past the target on every side. */
export const SPOTLIGHT_PADDING = 6;
/** Space kept inside the visible band. */
export const BAND_MARGIN = 8;
/** A scrolled-in target lands this far below the band's top. */
export const SCROLL_MARGIN = 16;
/** Space between the spotlight and the card. */
export const CARD_GAP = 12;
/** The card's distance from the screen's sides. */
export const SCREEN_MARGIN = 16;
/** Below this height a side is too small for the card. */
export const MIN_CARD_HEIGHT = 180;
/** Two measurements this close (points) are the same: layout has settled. */
export const STABLE_TOLERANCE = 1;

export type Size = { readonly width: number; readonly height: number };
export type Insets = { readonly top: number; readonly bottom: number };
export type Band = { readonly top: number; readonly bottom: number };

/** The part of the window where a tab's content is visible. */
export function visibleBand(window: Size, insets: Insets): Band {
  return {
    top: insets.top + BAND_MARGIN,
    bottom: window.height - insets.bottom - TAB_BAR_CLEARANCE,
  };
}

const finite = (n: number) => Number.isFinite(n);

/** A real, on-window rectangle: positive size, and overlapping the window. */
export function isValidRect(r: Rect | null | undefined, window: Size): boolean {
  if (!r) return false;
  if (![r.x, r.y, r.width, r.height].every(finite)) return false;
  if (r.width <= 0 || r.height <= 0) return false;
  return (
    r.x < window.width &&
    r.x + r.width > 0 &&
    r.y < window.height &&
    r.y + r.height > 0
  );
}

/**
 * Whether the target can be pointed at where it is: wholly inside the band,
 * or, when taller than the band, its top is inside it.
 */
export function insideBand(r: Rect, band: Band): boolean {
  if (r.y < band.top) return false;
  if (r.height > band.bottom - band.top) return r.y < band.bottom;
  return r.y + r.height <= band.bottom;
}

/** How far to scroll (positive = content up) to bring the target in; 0 if in. */
export function scrollDelta(r: Rect, band: Band): number {
  if (insideBand(r, band)) return 0;
  return r.y - (band.top + SCROLL_MARGIN);
}

/** A scroll offset kept inside what the scroll view can show. */
export function clampOffset(
  offset: number,
  limits: { readonly min: number; readonly max: number },
): number {
  const max = Math.max(limits.min, limits.max);
  return Math.min(max, Math.max(limits.min, offset));
}

/** The padded spotlight, clipped to the band; null when nothing is left. */
export function spotlight(r: Rect, band: Band, window: Size): Rect | null {
  const left = Math.max(SCREEN_MARGIN / 2, r.x - SPOTLIGHT_PADDING);
  const right = Math.min(
    window.width - SCREEN_MARGIN / 2,
    r.x + r.width + SPOTLIGHT_PADDING,
  );
  const top = Math.max(band.top, r.y - SPOTLIGHT_PADDING);
  const bottom = Math.min(band.bottom, r.y + r.height + SPOTLIGHT_PADDING);
  if (right - left <= 0 || bottom - top <= 0) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export type CardPlacement =
  | { readonly kind: "below"; readonly top: number; readonly maxHeight: number }
  | {
      readonly kind: "above";
      readonly bottom: number;
      readonly maxHeight: number;
    }
  /** Just above the tab bar (the note step). */
  | {
      readonly kind: "bottom";
      readonly bottom: number;
      readonly maxHeight: number;
    }
  /** In the middle of the band (intro, fallback, or no room by the target). */
  | { readonly kind: "center"; readonly maxHeight: number };

/**
 * Where the card goes. Beside a spotlight: below it when its center is in the
 * band's upper half, above otherwise, switching sides when that side is too
 * small, and centered when neither fits. The note card sits above the tab
 * bar. Everything else is centered.
 */
export function cardPlacement(
  spot: Rect | null,
  band: Band,
  window: Size,
  variant: "highlight" | "note" | "center",
): CardPlacement {
  const bandHeight = Math.max(0, band.bottom - band.top);
  if (variant === "note") {
    return {
      kind: "bottom",
      bottom: window.height - band.bottom + CARD_GAP,
      maxHeight: bandHeight - CARD_GAP,
    };
  }
  if (variant === "center" || !spot) {
    return { kind: "center", maxHeight: bandHeight };
  }
  const belowTop = spot.y + spot.height + CARD_GAP;
  const below = band.bottom - belowTop;
  const above = spot.y - CARD_GAP - band.top;
  const center = spot.y + spot.height / 2;
  const preferBelow = center < band.top + bandHeight / 2;
  const asBelow = (): CardPlacement => ({
    kind: "below",
    top: belowTop,
    maxHeight: below,
  });
  const asAbove = (): CardPlacement => ({
    kind: "above",
    bottom: window.height - (spot.y - CARD_GAP),
    maxHeight: above,
  });
  if (preferBelow && below >= MIN_CARD_HEIGHT) return asBelow();
  if (!preferBelow && above >= MIN_CARD_HEIGHT) return asAbove();
  if (below >= MIN_CARD_HEIGHT) return asBelow();
  if (above >= MIN_CARD_HEIGHT) return asAbove();
  return { kind: "center", maxHeight: bandHeight };
}

/** Two measurements of the same target agree: its layout has settled. */
export function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= STABLE_TOLERANCE &&
    Math.abs(a.y - b.y) <= STABLE_TOLERANCE &&
    Math.abs(a.width - b.width) <= STABLE_TOLERANCE &&
    Math.abs(a.height - b.height) <= STABLE_TOLERANCE
  );
}

/**
 * The four dimmed rectangles around a spotlight, which together cover the
 * window except the spotlight itself.
 */
export function dimRects(spot: Rect, window: Size): Rect[] {
  const right = spot.x + spot.width;
  const bottom = spot.y + spot.height;
  return [
    { x: 0, y: 0, width: window.width, height: spot.y },
    { x: 0, y: bottom, width: window.width, height: window.height - bottom },
    { x: 0, y: spot.y, width: spot.x, height: spot.height },
    { x: right, y: spot.y, width: window.width - right, height: spot.height },
  ].filter((r) => r.width > 0 && r.height > 0);
}
