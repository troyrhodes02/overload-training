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
  finishWithCustom?: {
    replace: FixtureExercise;
    custom: string;
    sets: readonly (readonly [weightLbs: number, reps: number])[];
  };
};

export const RESOURCE_PLANS = {
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
