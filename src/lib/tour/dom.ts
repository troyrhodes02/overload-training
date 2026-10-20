import type { TourAnchor, TourStep } from "./steps";
import { resolveTarget, type ResolvedTarget } from "./engine";

/**
 * Browser helpers for the onboarding tour (Onboarding Tour spec §13; R10).
 * A target is only ever an element the app really renders and the lifter can
 * really see at this width — never a guess.
 */

/**
 * Available = connected, has a box, is not visibility:hidden, and is not
 * inside an inert or hidden subtree (the dimmed workout under a missed-day
 * prompt is inert). A display:none ancestor (the rail below md, the menu
 * button at md+) leaves no box, so it is unavailable by the same rule.
 *
 * aria-hidden is deliberately NOT a reason: the tour's own modal dialog marks
 * everything outside it aria-hidden while it is open.
 */
export function isAvailable(el: Element): boolean {
  if (!el.isConnected) return false;
  if (el.closest("[inert],[hidden]")) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

/** The first available element carrying this anchor, or null. */
export function findAvailableAnchor(
  name: TourAnchor,
  doc: Document = document,
): HTMLElement | null {
  for (const el of doc.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    if (isAvailable(el)) return el;
  }
  return null;
}

export type FoundTarget = ResolvedTarget & { el: HTMLElement };

/**
 * Polls (every 50 ms) until the browser is on the step's route and one of its
 * targets is available; null after `timeoutMs` or when aborted.
 */
export function waitForTarget(
  step: TourStep,
  opts: { timeoutMs: number; signal: AbortSignal },
): Promise<FoundTarget | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + opts.timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (value: FoundTarget | null) => {
      if (timer !== undefined) clearTimeout(timer);
      opts.signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => done(null);
    const tick = () => {
      if (opts.signal.aborted) return done(null);
      if (window.location.pathname === step.route) {
        const found = resolveTarget(
          step,
          (a) => findAvailableAnchor(a) !== null,
        );
        const el = found ? findAvailableAnchor(found.anchor) : null;
        if (found && el) return done({ ...found, el });
      }
      if (Date.now() >= deadline) return done(null);
      timer = setTimeout(tick, 50);
    };
    opts.signal.addEventListener("abort", onAbort);
    tick();
  });
}
