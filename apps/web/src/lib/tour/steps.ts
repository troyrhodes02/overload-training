/**
 * THE ONBOARDING TOUR REGISTRY (Onboarding Tour spec §13; R9). The tour's
 * steps are defined in two halves and nowhere else: their words and order in
 * the shared package (@overload/shared/tour/content, Pitch 21b, so the native
 * tour reuses them) and their web placement here. The mechanism (engine.ts,
 * dom.ts, src/components/tour/*) only walks TOUR_STEPS.
 *
 * Adding a step is a data change (the `overload-onboarding` skill describes
 * it): add its id, title, and body to TOUR_CONTENT, in the lifter's journey
 * order, and its route and targets to PLACEMENT below (the type requires
 * both); if it points at a control that has no anchor yet, add the name to
 * TOUR_ANCHORS and put `{...tourAnchor("name")}` on that element. Nothing in
 * the mechanism changes.
 *
 * Each step names the route it lives on and the controls it can point at, in
 * priority order. The first one that is actually visible at the current width
 * wins (rail item on desktop, heading or menu button on a phone); a target can
 * carry its own body when the step should say something different there. A
 * step with no visible target is skipped. Copy is design doc Screen 2,
 * verbatim, and a later pitch's added step is its design doc's "Tour steps
 * added" table (both pinned by tests/unit/tour-registry.test.ts).
 */

import { TOUR_CONTENT, type TourStepId } from "@overload/shared/tour/content";

export const TOUR_ANCHORS = [
  "today-heading",
  "today-start",
  "today-day",
  "nav-menu",
  "nav-plan",
  "nav-history",
  "nav-goals",
  "nav-exercises",
  "nav-gyms",
  "page-plan",
  "plan-import",
  "page-history",
  "page-goals",
  "page-exercises",
  "page-gyms",
  "nav-billing",
  "page-billing",
  "settings-replay",
] as const;

export type TourAnchor = (typeof TOUR_ANCHORS)[number];

export type TourTarget = {
  anchor: TourAnchor;
  /** Replaces the step's body when this target is the one shown. */
  body?: string;
  /** Desktop card placement: beside a rail item, otherwise below/above. */
  side?: "right" | "below";
};

export type TourStep = {
  /** Stable; never changes when the copy does. */
  id: string;
  /** The pathname the step lives on. */
  route: string;
  /** Offered only at this layout (phone: below md). */
  layout?: "phone" | "desktop";
  /** Priority order; the first available target wins. */
  targets: readonly [TourTarget, ...TourTarget[]];
  title: string;
  body: string;
};

/** The attribute a target element carries: `<h1 {...tourAnchor("page-plan")}>`. */
export function tourAnchor(name: TourAnchor): { "data-tour": TourAnchor } {
  return { "data-tour": name };
}

const RAIL = "right" as const;

/** Where each step lives on the web and what it can point at. */
type TourPlacement = Pick<TourStep, "route" | "layout" | "targets">;

const PLACEMENT: Record<TourStepId, TourPlacement> = {
  today: {
    route: "/",
    targets: [{ anchor: "today-heading" }],
  },
  logging: {
    route: "/",
    targets: [
      { anchor: "today-start" },
      {
        anchor: "today-day",
        body: "When a workout is planned, it appears here with a Start button. Each exercise gets its own card where you enter the weight and reps you lifted, and Overload uses them to tell you when to progress, hold, or deload.",
      },
    ],
  },
  navigation: {
    route: "/",
    layout: "phone",
    targets: [{ anchor: "nav-menu" }],
  },
  plan: {
    route: "/plan",
    targets: [{ anchor: "nav-plan", side: RAIL }, { anchor: "page-plan" }],
  },
  // The Import existing plan action is easy to miss and is a Pro
  // capability, so the tour points it out. The target renders only for a Pro
  // account with import enabled; otherwise it is absent and the step is
  // skipped.
  "plan-import": {
    route: "/plan",
    targets: [{ anchor: "plan-import" }],
  },
  history: {
    route: "/history",
    targets: [
      { anchor: "nav-history", side: RAIL },
      { anchor: "page-history" },
    ],
  },
  goals: {
    route: "/goals",
    targets: [{ anchor: "nav-goals", side: RAIL }, { anchor: "page-goals" }],
  },
  // The exercise history lives behind Exercises, which the tour didn't visit.
  exercises: {
    route: "/exercises",
    targets: [
      { anchor: "nav-exercises", side: RAIL },
      { anchor: "page-exercises" },
    ],
  },
  gyms: {
    route: "/gyms",
    targets: [{ anchor: "nav-gyms", side: RAIL }, { anchor: "page-gyms" }],
  },
  "plan-billing": {
    route: "/settings/billing",
    targets: [
      { anchor: "nav-billing", side: RAIL },
      { anchor: "page-billing" },
    ],
  },
  settings: {
    route: "/settings",
    targets: [{ anchor: "settings-replay" }],
  },
};

/**
 * The registry the tour walks: the shared words (@overload/shared/tour/content)
 * joined to their web placement, in the shared journey order.
 */
export const TOUR_STEPS: readonly TourStep[] = TOUR_CONTENT.map((step) => ({
  id: step.id,
  ...PLACEMENT[step.id],
  title: step.title,
  body: step.body,
}));
