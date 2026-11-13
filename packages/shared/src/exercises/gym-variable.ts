import type { EquipmentValue } from "./taxonomy";

/**
 * The single authority for whether an Exercise's working weight is gym-variable
 * (Guided Workout Logging, Resolved Decisions 40–41). Decided from
 * `equipmentType` ALONE — never by name — so there is exactly one rule and no
 * parallel classification.
 *
 * Gym-variable: `machine` and `cable`, whose nominal weight can differ between
 * gyms, so they maintain a per-(gym, exercise) GymExerciseBaseline.
 * Everything else — free weights and `plate_loaded` — is gym-consistent and
 * gets no baseline row.
 *
 * Pure module (no Prisma import) so client islands can call it too.
 */
export const GYM_VARIABLE_EQUIPMENT = ["machine", "cable"] as const;

export function isGymVariable(exercise: {
  equipmentType: EquipmentValue;
}): boolean {
  return (
    exercise.equipmentType === "machine" || exercise.equipmentType === "cable"
  );
}
