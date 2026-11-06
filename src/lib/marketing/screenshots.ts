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
    sources: {
      light: {
        desktop: {
          src: "/marketing/screens/today-light-desktop.png",
          width: 1280,
          height: 876,
        },
        phone: {
          src: "/marketing/screens/today-light-phone.png",
          width: 780,
          height: 1084,
        },
      },
      dark: {
        desktop: {
          src: "/marketing/screens/today-dark-desktop.png",
          width: 1280,
          height: 876,
        },
        phone: {
          src: "/marketing/screens/today-dark-phone.png",
          width: 780,
          height: 1084,
        },
      },
    },
    provenance: {
      synthetic: true,
      fixtureVersion: "demo-v1",
      anchorDate: "2026-11-04",
      capturedOn: "2026-11-04",
      route: "/",
    },
  },
  logging: {
    id: "logging",
    alt: "The exercise logging card for Barbell Bench Press, showing what was lifted last time above the sets being logged.",
    sources: {
      light: {
        desktop: {
          src: "/marketing/screens/logging-light-desktop.png",
          width: 1280,
          height: 1504,
        },
        phone: {
          src: "/marketing/screens/logging-light-phone.png",
          width: 780,
          height: 1688,
        },
      },
      dark: {
        desktop: {
          src: "/marketing/screens/logging-dark-desktop.png",
          width: 1280,
          height: 1504,
        },
        phone: {
          src: "/marketing/screens/logging-dark-phone.png",
          width: 780,
          height: 1688,
        },
      },
    },
    provenance: {
      synthetic: true,
      fixtureVersion: "demo-v1",
      anchorDate: "2026-11-04",
      capturedOn: "2026-11-04",
      route: "/log/<today's Upper A>",
    },
  },
  exercise: {
    id: "exercise",
    alt: "The Barbell Bench Press page: the next-time call, ready to go up, with the weight to try and the sets that earned it.",
    sources: {
      light: {
        desktop: {
          src: "/marketing/screens/exercise-light-desktop.png",
          width: 1280,
          height: 1244,
        },
        phone: {
          src: "/marketing/screens/exercise-light-phone.png",
          width: 780,
          height: 1412,
        },
      },
      dark: {
        desktop: {
          src: "/marketing/screens/exercise-dark-desktop.png",
          width: 1280,
          height: 1244,
        },
        phone: {
          src: "/marketing/screens/exercise-dark-phone.png",
          width: 780,
          height: 1412,
        },
      },
    },
    provenance: {
      synthetic: true,
      fixtureVersion: "demo-v1",
      anchorDate: "2026-11-04",
      capturedOn: "2026-11-04",
      route: "/exercises/<Barbell Bench Press>",
    },
  },
  "gym-northside": {
    id: "gym-northside",
    alt: "Leverage Chest Press, a machine, at Northside Strength: that gym's working weight.",
    sources: {
      light: {
        desktop: {
          src: "/marketing/screens/gym-northside-light-desktop.png",
          width: 1280,
          height: 628,
        },
        phone: {
          src: "/marketing/screens/gym-northside-light-phone.png",
          width: 780,
          height: 772,
        },
      },
      dark: {
        desktop: {
          src: "/marketing/screens/gym-northside-dark-desktop.png",
          width: 1280,
          height: 628,
        },
        phone: {
          src: "/marketing/screens/gym-northside-dark-phone.png",
          width: 780,
          height: 772,
        },
      },
    },
    provenance: {
      synthetic: true,
      fixtureVersion: "demo-v1",
      anchorDate: "2026-11-04",
      capturedOn: "2026-11-04",
      route: "/exercises/<Leverage Chest Press>?gym=<Northside Strength>",
    },
  },
  "gym-riverside": {
    id: "gym-riverside",
    alt: "Leverage Chest Press at Riverside Fitness: a different working weight than at Northside Strength.",
    sources: {
      light: {
        desktop: {
          src: "/marketing/screens/gym-riverside-light-desktop.png",
          width: 1280,
          height: 628,
        },
        phone: {
          src: "/marketing/screens/gym-riverside-light-phone.png",
          width: 780,
          height: 772,
        },
      },
      dark: {
        desktop: {
          src: "/marketing/screens/gym-riverside-dark-desktop.png",
          width: 1280,
          height: 628,
        },
        phone: {
          src: "/marketing/screens/gym-riverside-dark-phone.png",
          width: 780,
          height: 772,
        },
      },
    },
    provenance: {
      synthetic: true,
      fixtureVersion: "demo-v1",
      anchorDate: "2026-11-04",
      capturedOn: "2026-11-04",
      route: "/exercises/<Leverage Chest Press>?gym=<Riverside Fitness>",
    },
  },
  trend: {
    id: "trend",
    alt: "The estimated 1-rep max trend for Barbell Bench Press over the demo weeks, with the scheduled deload week marked.",
    sources: {
      light: {
        desktop: {
          src: "/marketing/screens/trend-light-desktop.png",
          width: 1312,
          height: 806,
        },
        phone: {
          src: "/marketing/screens/trend-light-phone.png",
          width: 780,
          height: 686,
        },
      },
      dark: {
        desktop: {
          src: "/marketing/screens/trend-dark-desktop.png",
          width: 1312,
          height: 806,
        },
        phone: {
          src: "/marketing/screens/trend-dark-phone.png",
          width: 780,
          height: 686,
        },
      },
    },
    provenance: {
      synthetic: true,
      fixtureVersion: "demo-v1",
      anchorDate: "2026-11-04",
      capturedOn: "2026-11-04",
      route: "/exercises/<Barbell Bench Press> (Trend section)",
    },
  },
};
