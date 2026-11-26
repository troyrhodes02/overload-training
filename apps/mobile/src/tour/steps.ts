import {
  TOUR_CONTENT,
  TOUR_LOGGING_NO_START_BODY,
  TOUR_NATIVE_BODIES,
  type TourStepId,
} from "@overload/shared/tour/content";
import type { NativeTourStep, TourTab, TourTarget } from "./types";

/**
 * THE NATIVE TOUR'S ANCHOR MAP (Pitch 21k spec §7.3; 21b: "21k builds the
 * native tour from TOUR_CONTENT with its own anchor map"). The words and their
 * order are @overload/shared/tour/content, shared with the web; this file only
 * says where each step lives on the phone and what it can point at. The type
 * requires a decision for every shared step, so a step added for the web
 * forces one here too (a test pins it).
 *
 * Adding an anchor: add its name to TOUR_ANCHORS and wrap the real control in
 * `<TourAnchor name="…">` (or a `tourAnchor` prop on ScreenHeader, TabScreen,
 * or ListRow). Nothing in the mechanism changes.
 */

export const TOUR_ANCHORS = [
  "today-header",
  "today-start",
  "today-day",
  "plan-header",
  "history-header",
  "goals-header",
  "more-exercises",
  "more-gyms",
  "more-tour",
] as const;

export type TourAnchorName = (typeof TOUR_ANCHORS)[number];

type Target = TourTarget & { readonly anchor: TourAnchorName };

type NativePlacement = {
  readonly tab: TourTab;
  readonly kind: "anchored" | "note";
  readonly targets: readonly Target[];
  readonly where: string;
  readonly fallbackBody?: string;
};

const PLACEMENT: Record<TourStepId, NativePlacement | null> = {
  today: {
    tab: "today",
    kind: "anchored",
    targets: [{ anchor: "today-header", label: "the Today screen title" }],
    where: "the Today tab",
  },
  logging: {
    tab: "today",
    kind: "anchored",
    targets: [
      { anchor: "today-start", label: "the Start or Resume workout button" },
      {
        anchor: "today-day",
        label: "today's plan",
        body: TOUR_LOGGING_NO_START_BODY,
      },
    ],
    where: "the Today tab",
    fallbackBody: TOUR_LOGGING_NO_START_BODY,
  },
  // The tab bar is UIKit and can't be measured (RD-4): a note by design.
  navigation: { tab: "today", kind: "note", targets: [], where: "" },
  plan: {
    tab: "plan",
    kind: "anchored",
    targets: [{ anchor: "plan-header", label: "the Plan screen title" }],
    where: "the Plan tab",
  },
  // Plan import is web-only (CLAUDE.md mobile rules): nothing to point at.
  "plan-import": null,
  history: {
    tab: "history",
    kind: "anchored",
    targets: [{ anchor: "history-header", label: "the History screen title" }],
    where: "the History tab",
  },
  goals: {
    tab: "goals",
    kind: "anchored",
    targets: [{ anchor: "goals-header", label: "the Goals screen title" }],
    where: "the Goals tab",
  },
  exercises: {
    tab: "more",
    kind: "anchored",
    targets: [{ anchor: "more-exercises", label: "the Exercises row" }],
    where: "More",
  },
  gyms: {
    tab: "more",
    kind: "anchored",
    targets: [{ anchor: "more-gyms", label: "the Gyms row" }],
    where: "More",
  },
  // No billing path on the phone; the plan is one read-only row (RD-2).
  "plan-billing": null,
  settings: {
    tab: "more",
    kind: "anchored",
    targets: [{ anchor: "more-tour", label: "the Take a tour row" }],
    where: "More",
  },
};

/** The native tour: the shared steps, in the shared order, placed for iOS. */
export const NATIVE_TOUR_STEPS: readonly NativeTourStep[] =
  TOUR_CONTENT.flatMap((step): NativeTourStep[] => {
    const place = PLACEMENT[step.id];
    if (!place) return [];
    return [
      {
        id: step.id,
        title: step.title,
        body: TOUR_NATIVE_BODIES[step.id] ?? step.body,
        tab: place.tab,
        kind: place.kind,
        targets: place.targets,
        where: place.where,
        fallbackBody: place.fallbackBody,
      },
    ];
  });

/** The steps the web shows that the phone deliberately does not. */
export const WEB_ONLY_TOUR_STEPS: readonly TourStepId[] = (
  Object.keys(PLACEMENT) as TourStepId[]
).filter((id) => PLACEMENT[id] === null);
