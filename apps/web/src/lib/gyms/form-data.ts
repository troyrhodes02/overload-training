import type { RawGymInput } from "@overload/shared/gyms/validation";

// The web form adapter for the gym parser. FormData is a browser and
// server-action type, so this stays in the web when the parser moved to the
// shared package (Pitch 21b); the iPhone app sends JSON to the API instead.

/** Reads the gym form. Only these two fields are ever read. */
export function gymInputFromFormData(formData: FormData): RawGymInput {
  return {
    name: formData.get("name") ?? "",
    address: formData.get("address") ?? "",
  };
}
