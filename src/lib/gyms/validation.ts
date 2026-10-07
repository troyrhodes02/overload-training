/**
 * Gym input validation (spec Validation Rules, D9/D13/D39). A gym is a name and
 * an optional line of free text — never coordinates, never a map reference.
 */
export const GYM_NAME_MAX = 80;
export const GYM_ADDRESS_MAX = 200;

export type GymInput = { name: string; address: string | null };

export type RawGymInput = { name?: unknown; address?: unknown };

export function parseGymInput(
  raw: RawGymInput,
):
  | { ok: true; value: GymInput }
  | { ok: false; details: Record<string, string> } {
  const details: Record<string, string> = {};
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length === 0) details.name = "Enter a name.";
  else if (name.length > GYM_NAME_MAX)
    details.name = `Keep the name to ${GYM_NAME_MAX} characters or fewer.`;

  const addressRaw = typeof raw.address === "string" ? raw.address.trim() : "";
  if (
    raw.address !== undefined &&
    raw.address !== null &&
    typeof raw.address !== "string"
  )
    details.address = "Location must be plain text.";
  else if (addressRaw.length > GYM_ADDRESS_MAX)
    details.address = `Keep the location to ${GYM_ADDRESS_MAX} characters or fewer.`;

  if (Object.keys(details).length > 0) return { ok: false, details };
  return {
    ok: true,
    value: { name, address: addressRaw.length > 0 ? addressRaw : null },
  };
}

/** Reads the gym form. Only these two fields are ever read. */
export function gymInputFromFormData(formData: FormData): RawGymInput {
  return {
    name: formData.get("name") ?? "",
    address: formData.get("address") ?? "",
  };
}
