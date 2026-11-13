/**
 * Overload's canonical exercise classification vocabulary (Library & Gyms
 * Setup, spec D6/D8). There is exactly ONE muscle vocabulary and ONE equipment
 * vocabulary, shared by imported exercises, custom exercises, the library
 * filter, and later features (Exercise Swap, gym-variable rules).
 *
 * The values mirror the Prisma enums `MuscleGroup` and `Equipment` (a unit test
 * asserts they match). This module is deliberately pure — no Prisma import — so
 * client islands can render the same lists without bundling the database
 * client. Source-to-canonical mappings live with the import
 * (prisma/seed/free-exercise-db/normalize.ts) and docs/planning/method-note.md.
 */

/** Display order is the order of this array. */
export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "lower_back",
  "traps",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "adductors",
  "abductors",
  "neck",
] as const;

export type MuscleGroupValue = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroupValue, string> = {
  chest: "Chest",
  back: "Back",
  lower_back: "Lower Back",
  traps: "Traps",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  adductors: "Adductors",
  abductors: "Abductors",
  neck: "Neck",
};

/** Display order is the order of this array. */
export const EQUIPMENT_TYPES = [
  "barbell",
  "ez_bar",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "plate_loaded",
  "bodyweight",
  "band",
  "medicine_ball",
  "exercise_ball",
  "foam_roller",
  "other",
] as const;

export type EquipmentValue = (typeof EQUIPMENT_TYPES)[number];

export const EQUIPMENT_LABELS: Record<EquipmentValue, string> = {
  barbell: "Barbell",
  ez_bar: "EZ bar",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  cable: "Cable",
  machine: "Machine",
  plate_loaded: "Plate-loaded machine",
  bodyweight: "Bodyweight",
  band: "Band",
  medicine_ball: "Medicine ball",
  exercise_ball: "Exercise ball",
  foam_roller: "Foam roller",
  other: "Other",
};

export function isMuscleGroup(value: unknown): value is MuscleGroupValue {
  return (
    typeof value === "string" &&
    (MUSCLE_GROUPS as readonly string[]).includes(value)
  );
}

export function isEquipment(value: unknown): value is EquipmentValue {
  return (
    typeof value === "string" &&
    (EQUIPMENT_TYPES as readonly string[]).includes(value)
  );
}

export function muscleGroupLabel(value: MuscleGroupValue): string {
  return MUSCLE_GROUP_LABELS[value];
}

export function equipmentLabel(value: EquipmentValue): string {
  return EQUIPMENT_LABELS[value];
}
