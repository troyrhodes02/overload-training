/**
 * The landing page's screenshots and where they came from (spec §13, RD-19;
 * pitch P21-AC3). Every image is a real capture of the app running on the
 * isolated local stack against the SYNTHETIC demo account seeded by
 * `scripts/demo` — never a mockup, never a real lifter's data. A shot whose
 * `sources` is null has not been captured yet, and the page shows a labelled
 * pending frame in its place.
 *
 * Files live under public/marketing/screens/. Tests check that every listed
 * file exists and that every entry is marked synthetic.
 */

export type ShotId =
  | "today"
  | "logging"
  | "exercise"
  | "gym-northside"
  | "gym-riverside"
  | "trend";

export type ShotImage = { src: string; width: number; height: number };

export type ShotSources = {
  light: { desktop: ShotImage; phone: ShotImage | null };
  dark: { desktop: ShotImage; phone: ShotImage | null } | null;
};

export type ShotProvenance = {
  /** Always true: the only allowed source is the synthetic demo account. */
  synthetic: true;
  /** The demo fixture version the account was seeded with. */
  fixtureVersion: string;
  /** The fixture anchor date (the demo's "today"). */
  anchorDate: string;
  /** The day the capture was taken. */
  capturedOn: string;
  /** The app route captured. */
  route: string;
};

export type Shot = {
  id: ShotId;
  /** Describes what the screen shows, for screen readers. */
  alt: string;
  sources: ShotSources | null;
  provenance: ShotProvenance | null;
};

export const SHOTS: Record<ShotId, Shot> = {
  today: {
    id: "today",
    alt: "Overload's Today screen for the demo account: the planned lifts, with Barbell Bench Press marked ready to go up.",
    sources: null,
    provenance: null,
  },
  logging: {
    id: "logging",
    alt: "The exercise logging card for Barbell Bench Press, showing what was lifted last time above the sets being logged.",
    sources: null,
    provenance: null,
  },
  exercise: {
    id: "exercise",
    alt: "The Barbell Bench Press page: the next-time call, ready to go up, with the weight to try and the sets that earned it.",
    sources: null,
    provenance: null,
  },
  "gym-northside": {
    id: "gym-northside",
    alt: "Chest Press Machine at Northside Strength, with that gym's working weight.",
    sources: null,
    provenance: null,
  },
  "gym-riverside": {
    id: "gym-riverside",
    alt: "Chest Press Machine at Riverside Fitness, with a different working weight than at Northside Strength.",
    sources: null,
    provenance: null,
  },
  trend: {
    id: "trend",
    alt: "The estimated 1-rep max trend for Barbell Bench Press over the demo weeks, with the scheduled deload week marked.",
    sources: null,
    provenance: null,
  },
};
