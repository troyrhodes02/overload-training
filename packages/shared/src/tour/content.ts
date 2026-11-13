/**
 * The onboarding tour's words, in the lifter's journey order (Onboarding Tour
 * spec §13; moved out of apps/web/src/lib/tour/steps.ts in Pitch 21b). Each
 * step has a stable id, a title, and a body; nothing here knows about a page,
 * an anchor, a screen width, or a pixel.
 *
 * The web tour joins each id to its route and on-page targets
 * (apps/web/src/lib/tour/steps.ts); the native tour (21k) will join the same
 * ids to its own anchors. Copy is design doc Screen 2, verbatim, plus each
 * later pitch's "Tour steps added" table (pinned by
 * apps/web/tests/unit/tour-registry.test.ts).
 */

export type TourStepContent = {
  /** Stable; never changes when the copy does. */
  readonly id: string;
  readonly title: string;
  readonly body: string;
};

export const TOUR_CONTENT = [
  {
    id: "today",
    title: "Today",
    body: "Each day starts here. When your plan has a workout today, it shows up below; rest days and finished days say so too.",
  },
  {
    id: "logging",
    title: "Logging a workout",
    body: "Start opens the workout one exercise at a time. On each card you enter the weight and reps you lifted, and Overload uses them to tell you when to progress, hold, or deload.",
  },
  {
    id: "navigation",
    title: "Getting around",
    body: "Everything else is in this menu: Plan, History, Goals, Exercises, Gyms, and Settings.",
  },
  {
    id: "plan",
    title: "Plan",
    body: "Build your training here: a mesocycle of weeks, sessions on the days you train, and the sets and rep ranges for each exercise. Overload follows the plan you write.",
  },
  // Workout Plan Import & Review (overload-onboarding, OVE-110). Copy is that
  // design doc's "Tour steps added" table, verbatim.
  {
    id: "plan-import",
    title: "Import an existing plan",
    body: "Already have a plan written down? Import it — paste it or upload a photo, review what we read, and nothing saves until you confirm.",
  },
  {
    id: "history",
    title: "History",
    body: "Every workout you log is kept here, week by week. Open a day to see what you lifted or correct a set.",
  },
  {
    id: "goals",
    title: "Goals",
    body: "Set a weight-and-reps target for a lift and follow how close your best sets are getting.",
  },
  // Exercise History & PR Intelligence (overload-onboarding, OVE-72). Copy is
  // that design doc's "Tour steps added" table, verbatim.
  {
    id: "exercises",
    title: "Exercises",
    body: "Every exercise in the library, plus any you add. Open one to see its history: your sessions, best sets, the trend, and what to do next time.",
  },
  {
    id: "gyms",
    title: "Gyms",
    body: "Machines and cables vary from gym to gym, so Overload keeps their working weights per gym. Free weights count the same everywhere.",
  },
  {
    id: "plan-billing",
    title: "Plan & Billing",
    body: "Your plan lives here. New accounts get 14 days of Pro — after that you stay on Free with everything you've logged.",
  },
  {
    id: "settings",
    title: "Settings",
    body: "Your name, timezone, and appearance live here, in the Account & app section of the navigation. Come back to replay this tour any time.",
  },
] as const satisfies readonly TourStepContent[];

export type TourStepId = (typeof TOUR_CONTENT)[number]["id"];
