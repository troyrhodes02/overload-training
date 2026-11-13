/**
 * The exercise library and an exercise's detail. Built by
 * apps/web/src/lib/exercises/queries.ts (moved here in Pitch 21b, so the
 * compiler holds the server's output to the contract). Wire conventions:
 * ./wire.ts.
 */
import type { EquipmentValue, MuscleGroupValue } from "../exercises/taxonomy";

/**
 * Exercise reads for the library (spec "Reads"). Every SELECTION query filters
 * `deletedAt: null`; `getExercise` deliberately does not, because history and
 * direct links must still resolve an archived exercise (CLAUDE.md Layer 1).
 * Data comes from Overload's own tables only — never the source dataset.
 *
 * Multi-User Foundation: the account sees the shared library plus its own
 * custom exercises (the scoped client enforces it), and "favorite" means the
 * acting account's ExerciseFavorite row, never a flag on the shared row.
 */

export type ExerciseListItemDto = {
  id: string;
  name: string;
  primaryMuscle: MuscleGroupValue;
  primaryMuscleLabel: string;
  equipmentLabel: string;
  isCustom: boolean;
  isFavorite: boolean;
  imageUrl: string | null;
};

export type ExerciseDetailDto = ExerciseListItemDto & {
  equipmentType: EquipmentValue;
  secondaryMuscleLabels: string[];
  isArchived: boolean;
  /** Only the account's own custom exercises can be archived (spec R13). */
  canArchive: boolean;
};

export type ExerciseList = {
  items: ExerciseListItemDto[];
  total: number;
  limit: number;
  /** Any active exercise exists at all (distinguishes "catalog not imported"). */
  hasAnyActive: boolean;
  /** Any active favorite exists at all (distinguishes "no favorites yet"). */
  hasAnyFavorites: boolean;
};
