/**
 * The native tour's shapes (Pitch 21k spec §4, §7.3). The words come from
 * @overload/shared/tour/content; a step here only adds where it lives on the
 * phone (its tab), what it can point at, and how to say where it is when it
 * can't point.
 */

/** The five tabs of the signed-in shell (`src/app/(tabs)`). */
export type TourTab = "today" | "history" | "plan" | "goals" | "more";

/** Each tab's root path: the only places the tour ever navigates to. */
export const TOUR_TAB_PATHS: Readonly<Record<TourTab, string>> = {
  today: "/today",
  history: "/history",
  plan: "/plan",
  goals: "/goals",
  more: "/more",
};

export type TourTarget = {
  /** The anchor's registered name (`TourAnchor name`). */
  readonly anchor: string;
  /** Replaces the step's body when this target is the one shown. */
  readonly body?: string;
  /** What VoiceOver hears is highlighted: "the Start workout button". */
  readonly label: string;
};

export type NativeTourStep = {
  /** The shared step id (TourStepId); stable. */
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly tab: TourTab;
  /**
   * "anchored": points at a measured view when it can, otherwise explains in
   * words. "note": never highlights (the tab bar can't be measured, RD-4).
   */
  readonly kind: "anchored" | "note";
  /** Priority order; the first one registered and measurable wins. */
  readonly targets: readonly TourTarget[];
  /** Fallback line's place: "the Goals tab", "More". */
  readonly where: string;
  /** The body when no target can be shown (defaults to `body`). */
  readonly fallbackBody?: string;
};

/** A rectangle in window coordinates (points). */
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};
