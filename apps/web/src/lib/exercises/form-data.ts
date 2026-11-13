import type { RawCustomExerciseInput } from "@overload/shared/exercises/validation";

// The web form adapter for the custom exercise parser. FormData is a browser and
// server-action type, so this stays in the web when the parser moved to the
// shared package (Pitch 21b); the iPhone app sends JSON to the API instead.

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
