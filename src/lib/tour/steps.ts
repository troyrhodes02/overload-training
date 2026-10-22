/**
 * THE ONBOARDING TOUR REGISTRY (Onboarding Tour spec §13; R9). The tour's
 * steps live here and nowhere else: the mechanism (engine.ts, dom.ts,
 * src/components/tour/*) only walks this list.
 *
 * Adding a step is a data change (the `overload-onboarding` skill describes
 * it): add an entry below, in the lifter's journey order, with a stable id;
 * if it points at a control that has no anchor yet, add the name to
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
  "page-history",
  "page-goals",
  "page-exercises",
  "page-gyms",
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

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "today",
    route: "/",
    targets: [{ anchor: "today-heading" }],
    title: "Today",
    body: "Each day starts here. When your plan has a workout today, it shows up below; rest days and finished days say so too.",
  },
  {
    id: "logging",
    route: "/",
    targets: [
      { anchor: "today-start" },
      {
        anchor: "today-day",
        body: "When a workout is planned, it appears here with a Start button. Each exercise gets its own card where you enter the weight and reps you lifted, and Overload uses them to tell you when to progress, hold, or deload.",
      },
    ],
    title: "Logging a workout",
    body: "Start opens the workout one exercise at a time. On each card you enter the weight and reps you lifted, and Overload uses them to tell you when to progress, hold, or deload.",
  },
  {
    id: "navigation",
    route: "/",
    layout: "phone",
    targets: [{ anchor: "nav-menu" }],
    title: "Getting around",
    body: "Everything else is in this menu: Plan, History, Goals, Exercises, Gyms, and Settings.",
  },
  {
    id: "plan",
    route: "/plan",
    targets: [{ anchor: "nav-plan", side: RAIL }, { anchor: "page-plan" }],
    title: "Plan",
    body: "Build your training here: a mesocycle of weeks, sessions on the days you train, and the sets and rep ranges for each exercise. Overload follows the plan you write.",
  },
  {
    id: "history",
    route: "/history",
    targets: [
      { anchor: "nav-history", side: RAIL },
      { anchor: "page-history" },
    ],
    title: "History",
    body: "Every workout you log is kept here, week by week. Open a day to see what you lifted or correct a set.",
  },
  {
    id: "goals",
    route: "/goals",
    targets: [{ anchor: "nav-goals", side: RAIL }, { anchor: "page-goals" }],
    title: "Goals",
    body: "Set a weight-and-reps target for a lift and follow how close your best sets are getting.",
  },
  {
    // Exercise History & PR Intelligence (overload-onboarding, OVE-72): the
    // history lives behind Exercises, which the tour didn't visit. Copy is
    // that design doc's "Tour steps added" table, verbatim.
    id: "exercises",
    route: "/exercises",
    targets: [
      { anchor: "nav-exercises", side: RAIL },
      { anchor: "page-exercises" },
    ],
    title: "Exercises",
    body: "Every exercise in the library, plus any you add. Open one to see its history: your sessions, best sets, the trend, and what to do next time.",
  },
  {
    id: "gyms",
    route: "/gyms",
    targets: [{ anchor: "nav-gyms", side: RAIL }, { anchor: "page-gyms" }],
    title: "Gyms",
    body: "Machines and cables vary from gym to gym, so Overload keeps their working weights per gym. Free weights count the same everywhere.",
  },
  {
    id: "settings",
    route: "/settings",
    targets: [{ anchor: "settings-replay" }],
    title: "Settings",
    body: "Your name, timezone, and appearance live here, under the ⋮ menu at the top. Come back to replay this tour any time.",
  },
];
