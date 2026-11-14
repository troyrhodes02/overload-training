/**
 * The exercise library and an exercise's detail. Built by
 * apps/web/src/lib/exercises/queries.ts (moved here in Pitch 21b, so the
 * compiler holds the server's output to the contract). Wire conventions:
 * ./wire.ts.
 */
import type { EquipmentValue, MuscleGroupValue } from "../exercises/taxonomy";

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
