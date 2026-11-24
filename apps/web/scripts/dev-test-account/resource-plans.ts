/**
 * Pitch 21h (spec §11, RD-24): the extra resources a test account gets on
 * top of its demo story — custom exercises, favorites, gyms, archived ones,
 * and (for the custom-exercise scenario) a finished workout that performed a
 * custom exercise. Pure descriptions: the DB step (./resources.ts) applies
 * them through the app's own write modules only, in one transaction.
 */
import type {
  EquipmentValue,
  MuscleGroupValue,
} from "@overload/shared/exercises/taxonomy";
import type { FixtureExercise } from "../demo/fixture";

export type ResourceCustomExercise = {
  name: string;
  primaryMuscle: MuscleGroupValue;
  equipmentType: EquipmentValue;
  secondaryMuscles?: MuscleGroupValue[];
  favorite?: boolean;
  archived?: boolean;
};

export type ResourceGym = { name: string; address?: string | null };

/**
 * Pitch 21i: a goal set through `createGoal` (the web's and the phone's own
 * create). A target the story already meets completes at creation, as it
 * would for a lifter; `archive` retires it afterwards through `archiveGoal`.
 */
export type ResourceGoal = {
  ex: FixtureExercise;
  /** The fixture gym a machine goal is measured at (by name). */
  gym?: string;
  weightLbs: number;
  reps: number;
  archive?: boolean;
};

export type ResourcePlan = {
  /** Library exercises to star, by fixture key. */
  favorites?: readonly FixtureExercise[];
  customExercises?: readonly ResourceCustomExercise[];
  gyms?: readonly ResourceGym[];
  /** Fixture gyms (by name) to archive after seeding; their history stays. */
  archiveGyms?: readonly string[];
  /**
   * Finish the seeded in-progress workout after swapping one of its unlogged
   * exercises for a custom one and logging these sets on it (custom-exercises).
   */
  /**
   * Pitch 21i: record RIR on an exercise's most recent finished sessions
   * through `editLoggedSet` (the History correction path), so the lifter's
   * history shows RIR where the story logged none. Weights and reps stay.
   */
  rir?: {
    ex: FixtureExercise;
    sessions: number;
    values: readonly (number | null)[];
  };
  goals?: readonly ResourceGoal[];
  finishWithCustom?: {
    replace: FixtureExercise;
    custom: string;
    sets: readonly (readonly [weightLbs: number, reps: number])[];
  };
};

export const RESOURCE_PLANS = {
  /**
   * Pitch 21i's one primary account (on the gym story): RIR on the last two
   * Bench sessions, an active Bench goal with measurable progress, an active
   * Chest Press goal at Northside, a Squat target the history already meets
   * (one Goal-reached card), and an archived Military Press goal.
   */
  "21i-combined": {
    rir: { ex: "BENCH", sessions: 2, values: [2, 1, 1] },
    goals: [
      { ex: "BENCH", weightLbs: 225, reps: 5 },
      {
        ex: "CHEST_PRESS",
        gym: "Northside Strength",
        weightLbs: 180,
        reps: 10,
      },
      { ex: "SQUAT", weightLbs: 135, reps: 5 },
      { ex: "OHP", weightLbs: 155, reps: 5, archive: true },
    ],
  },
  /** Pitch 21i's Free account: one active goal on the standard story. */
  "21i-free": {
    goals: [{ ex: "BENCH", weightLbs: 225, reps: 5 }],
  },
  library: {
    favorites: ["BENCH", "SQUAT", "LATERAL"],
    customExercises: [
      {
        name: "Landmine Press",
        primaryMuscle: "shoulders",
        equipmentType: "barbell",
        secondaryMuscles: ["triceps"],
        favorite: true,
      },
    ],
  },
  "custom-exercises": {
    customExercises: [
      {
        name: "Landmine Press",
        primaryMuscle: "shoulders",
        equipmentType: "barbell",
      },
      {
        name: "Banded Face Pull",
        primaryMuscle: "shoulders",
        equipmentType: "band",
      },
      {
        name: "Cable Y Raise",
        primaryMuscle: "shoulders",
        equipmentType: "cable",
        archived: true,
      },
    ],
    finishWithCustom: {
      replace: "OHP",
      custom: "Landmine Press",
      sets: [
        [95, 10],
        [95, 9],
        [95, 8],
      ],
    },
  },
  gyms: {
    gyms: [{ name: "Downtown Annex", address: "410 Main St, 2nd floor" }],
    archiveGyms: ["Riverside Fitness"],
  },
  "isolation-resources-a": {
    favorites: ["BENCH"],
    customExercises: [
      {
        name: "Alpha Landmine Press",
        primaryMuscle: "shoulders",
        equipmentType: "barbell",
        favorite: true,
      },
    ],
    gyms: [{ name: "Alpha Annex", address: "1 Alpha Way" }],
  },
  "isolation-resources-b": {
    favorites: ["PULLUPS"],
    customExercises: [
      {
        name: "Bravo Sled Push",
        primaryMuscle: "quads",
        equipmentType: "other",
        favorite: true,
      },
    ],
    gyms: [{ name: "Bravo Garage", address: null }],
  },
} as const satisfies Record<string, ResourcePlan>;

export type ResourcePlanName = keyof typeof RESOURCE_PLANS;
