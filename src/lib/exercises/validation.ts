/**
 * Server-side validation for custom exercise creation (spec Validation Rules,
 * D7/D39). Pure: shared by the write module (authoritative) and usable by the
 * form for identical messages. There is deliberately no image field: custom
 * exercises have no image and no upload path exists.
 */
import {
  isEquipment,
  isMuscleGroup,
  type EquipmentValue,
  type MuscleGroupValue,
} from "./taxonomy";

export const EXERCISE_NAME_MAX = 100;
export const SECONDARY_MUSCLES_MAX = 15;

export type CustomExerciseInput = {
  name: string;
  primaryMuscle: MuscleGroupValue;
  equipmentType: EquipmentValue;
  secondaryMuscles: MuscleGroupValue[];
};

/** Untrusted input as it arrives from a form or caller. */
export type RawCustomExerciseInput = {
  name?: unknown;
  primaryMuscle?: unknown;
  equipmentType?: unknown;
  secondaryMuscles?: unknown;
};

export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; details: Record<string, string> };

export function parseCustomExerciseInput(
  raw: RawCustomExerciseInput,
): ParseResult<CustomExerciseInput> {
  const details: Record<string, string> = {};

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length === 0) details.name = "Enter a name.";
  else if (name.length > EXERCISE_NAME_MAX)
    details.name = `Keep the name to ${EXERCISE_NAME_MAX} characters or fewer.`;

  const primaryMuscle = raw.primaryMuscle;
  if (!isMuscleGroup(primaryMuscle))
    details.primaryMuscle = "Choose a primary muscle.";

  const equipmentType = raw.equipmentType;
  if (!isEquipment(equipmentType))
    details.equipmentType = "Choose the equipment.";

  const secondaryRaw =
    raw.secondaryMuscles === undefined || raw.secondaryMuscles === null
      ? []
      : raw.secondaryMuscles;
  const secondaryMuscles: MuscleGroupValue[] = [];
  if (!Array.isArray(secondaryRaw) || !secondaryRaw.every(isMuscleGroup)) {
    details.secondaryMuscles = "Choose secondary muscles from the list.";
  } else if (new Set(secondaryRaw).size !== secondaryRaw.length) {
    details.secondaryMuscles = "List each secondary muscle once.";
  } else if (
    isMuscleGroup(primaryMuscle) &&
    secondaryRaw.includes(primaryMuscle)
  ) {
    details.secondaryMuscles =
      "The primary muscle can't also be a secondary muscle.";
  } else if (secondaryRaw.length > SECONDARY_MUSCLES_MAX) {
    details.secondaryMuscles = "Too many secondary muscles.";
  } else {
    secondaryMuscles.push(...secondaryRaw);
  }

  if (Object.keys(details).length > 0) return { ok: false, details };
  return {
    ok: true,
    value: {
      name,
      primaryMuscle: primaryMuscle as MuscleGroupValue,
      equipmentType: equipmentType as EquipmentValue,
      secondaryMuscles,
    },
  };
}

/** Reads the custom exercise form. Only these four fields are ever read. */
export function customExerciseInputFromFormData(
  formData: FormData,
): RawCustomExerciseInput {
  return {
    name: formData.get("name") ?? "",
    primaryMuscle: formData.get("primaryMuscle") ?? "",
    equipmentType: formData.get("equipmentType") ?? "",
    secondaryMuscles: formData.getAll("secondaryMuscles"),
  };
}
