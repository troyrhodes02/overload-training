import type { TourAnchor, TourStep } from "./steps";

/**
 * The onboarding tour's pure engine (Onboarding Tour spec §13). No DOM, no
 * React, and no knowledge of any particular step: everything here works on
 * whatever registry it is given, which is what lets a later pitch add a step
 * as data alone (AC-4).
 */

export type TourLayout = "phone" | "desktop";

/** Wait this long for a step's route and target before skipping it (R12). */
export const TOUR_TARGET_TIMEOUT_MS = 5000;
/** The spotlight extends this far past the target on every side. */
export const TOUR_SPOTLIGHT_PADDING_PX = 6;
/** Space between the spotlight ring and the desktop card. */
export const TOUR_CARD_GAP_PX = 12;
/** The desktop card stays at least this far inside the viewport. */
export const TOUR_VIEWPORT_MARGIN_PX = 16;
/** Tailwind `md`: at and above it the rail replaces the phone menu (R11). */
export const TOUR_DESKTOP_QUERY = "(min-width: 768px)";

/** The steps offered at this layout, in registry order. */
export function stepsForLayout(
  steps: readonly TourStep[],
  layout: TourLayout,
): TourStep[] {
  return steps.filter((s) => s.layout === undefined || s.layout === layout);
}

export type ResolvedTarget = {
  anchor: TourAnchor;
  body: string;
  side: "right" | "below";
};

/** The first available target of a step, with the body it shows, or null. */
export function resolveTarget(
  step: TourStep,
  isAvailable: (anchor: TourAnchor) => boolean,
): ResolvedTarget | null {
  for (const t of step.targets) {
    if (isAvailable(t.anchor)) {
      return {
        anchor: t.anchor,
        body: t.body ?? step.body,
        side: t.side ?? "below",
      };
    }
  }
  return null;
}

/** Where a run begins: the named step, or the first one (unknown id → 0). */
export function startIndex(steps: readonly TourStep[], from?: string): number {
  if (from === undefined) return 0;
  const i = steps.findIndex((s) => s.id === from);
  return i < 0 ? 0 : i;
}

/**
 * "position of total" for the step at `index`, counting only the steps that
 * were not skipped this run (a skipped step drops out of both numbers).
 */
export function counter(
  steps: readonly TourStep[],
  skipped: ReadonlySet<string>,
  index: number,
): { position: number; total: number } {
  let position = 0;
  let total = 0;
  steps.forEach((s, i) => {
    if (skipped.has(s.id)) return;
    total += 1;
    if (i <= index) position += 1;
  });
  return { position, total };
}

/**
 * The next index to try from `index` in direction `dir`, passing over steps
 * already skipped this run; -1 before the start, steps.length past the end.
 */
export function nextIndex(
  steps: readonly TourStep[],
  skipped: ReadonlySet<string>,
  index: number,
  dir: 1 | -1,
): number {
  let i = index + dir;
  while (i >= 0 && i < steps.length && skipped.has(steps[i].id)) i += dir;
  return i;
}

/**
 * After the layout changes mid-run: where the current step lives in the new
 * list, or (a step the new layout does not offer) the next registry step it
 * does offer.
 */
export function indexAfterLayoutChange(
  all: readonly TourStep[],
  next: readonly TourStep[],
  currentId: string,
): number {
  const same = next.findIndex((s) => s.id === currentId);
  if (same >= 0) return same;
  const from = all.findIndex((s) => s.id === currentId);
  for (let i = from + 1; i < all.length; i++) {
    const j = next.findIndex((s) => s.id === all[i].id);
    if (j >= 0) return j;
  }
  return next.length;
}

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(v, Math.max(lo, hi)));

/**
 * Desktop card position (R15): beside the target when it asks for the right
 * side and there is room, otherwise below it, otherwise above it; always kept
 * TOUR_VIEWPORT_MARGIN_PX inside the viewport and clear of the spotlight ring
 * whenever the viewport has room for that.
 */
export function placeCard(
  target: Rect,
  card: Size,
  viewport: Size,
  prefer: "right" | "below",
): { top: number; left: number } {
  const pad = TOUR_SPOTLIGHT_PADDING_PX;
  const gap = TOUR_CARD_GAP_PX;
  const m = TOUR_VIEWPORT_MARGIN_PX;
  const maxLeft = viewport.width - m - card.width;
  const maxTop = viewport.height - m - card.height;

  if (prefer === "right") {
    const left = target.left + target.width + pad + gap;
    if (left <= maxLeft) {
      return { left, top: clamp(target.top - pad, m, maxTop) };
    }
  }

  const left = clamp(target.left, m, maxLeft);
  const below = target.top + target.height + pad + gap;
  if (below <= maxTop) return { left, top: below };
  const above = target.top - pad - gap - card.height;
  if (above >= m) return { left, top: above };
  return { left, top: clamp(below, m, maxTop) };
}
