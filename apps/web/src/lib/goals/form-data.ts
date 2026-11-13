import type { RawGoalInput } from "@overload/shared/goals/validation";

// The web form adapter for the goal parser. FormData is a browser and
// server-action type, so this stays in the web when the parser moved to the
// shared package (Pitch 21b); the iPhone app sends JSON to the API instead.

/** Reads the goal form. Only these four fields are ever read. */
export function goalInputFromFormData(formData: FormData): RawGoalInput {
  return {
    exerciseId: formData.get("exerciseId") ?? "",
    gymId: formData.get("gymId") ?? "",
    targetWeightLbs: formData.get("targetWeightLbs") ?? "",
    targetReps: formData.get("targetReps") ?? "",
  };
}
