import type { EquipmentValue } from "./taxonomy";

/**
 * The single authority for how an Exercise's sets are loaded, and therefore
 * whether a logged set carries an external weight. Decided from `equipmentType`
 * ALONE — never by name — mirroring isGymVariable (gym-variable.ts).
 *
 *  - `bodyweight`: equipment `bodyweight` (free-exercise-db "body only"). A set
 *    is reps only; its external weight is stored as NULL, never 0 or a guess.
 *  - `external_load`: every other equipment value. A set needs weight > 0.
 *
 * Explicitly weighted variants in the catalog (e.g. "Weighted Pull Ups",
 * "Weighted Bench Dip") are classified `other` by the source, so they stay
 * `external_load`. Bodyweight movements the source files under `other` or no
 * equipment (e.g. "Parallel Bar Dip") also stay `external_load`; the lifter can
 * add a custom exercise with Bodyweight equipment for those. Equipment is
 * immutable after creation, so an exercise never changes mode under its history.
 *
 * Pure module (no Prisma import) so client islands can call it too.
 */
export type LoadingMode = "external_load" | "bodyweight";

export function loadingMode(exercise: {
  equipmentType: EquipmentValue;
}): LoadingMode {
  return exercise.equipmentType === "bodyweight"
    ? "bodyweight"
    : "external_load";
}

export function requiresExternalWeight(exercise: {
  equipmentType: EquipmentValue;
}): boolean {
  return loadingMode(exercise) === "external_load";
}
