import { useSyncExternalStore } from "react";
import { parseProfileInput } from "@overload/shared/accounts/validation";
import type { ProfileDto } from "@overload/shared/contracts/account";

/**
 * A1 Profile's pure rules (Pitch 21j design §6 A1; RD-2, RD-3). The shared
 * parser gives early, identical feedback; the server's `updateProfile` stays
 * the authority and its per-field details replace these on save.
 */

export type ProfileDraft = ProfileDto;
export type ProfileField = keyof ProfileDraft;
export type ProfileErrors = Partial<Record<ProfileField, string>>;

const FIELDS: readonly ProfileField[] = [
  "firstName",
  "lastName",
  "username",
  "timeZone",
];

/** Whether the draft differs from what the server last saved. */
export function isDirty(draft: ProfileDraft, saved: ProfileDraft): boolean {
  return FIELDS.some((f) => draft[f].trim() !== saved[f].trim());
}

/**
 * The shared rules on the draft. An account that has never had a username
 * may keep it empty (the web's rule); one that has a username can't clear it.
 */
export function checkProfile(
  draft: ProfileDraft,
  saved: ProfileDraft,
): ProfileErrors {
  const parsed = parseProfileInput(draft, {
    usernameRequired: saved.username !== "",
  });
  return parsed.ok ? {} : parsed.details;
}

/** The server's per-field details, kept to the four fields. */
export function fieldErrorsFrom(
  details: Record<string, string> | undefined,
): ProfileErrors {
  const out: ProfileErrors = {};
  for (const f of FIELDS) if (details?.[f]) out[f] = details[f];
  return out;
}

/**
 * The "This iPhone" suggestion on A2: the device's zone, only when the server
 * accepts it and it isn't already the chosen one.
 */
export function deviceZoneSuggestion(
  deviceZone: string | null | undefined,
  current: string,
  zones: readonly string[],
): string | null {
  if (!deviceZone || deviceZone === current) return null;
  return zones.includes(deviceZone) ? deviceZone : null;
}

/** A2's search: case-insensitive, "_" and "/" read as spaces. */
export function filterZones(zones: readonly string[], query: string): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[_/]/g, " ");
  const q = norm(query.trim());
  if (!q) return [...zones];
  return zones.filter((z) => norm(z).includes(q));
}

// A2 → A1: the zone chosen on A2, picked up by A1's draft (not yet saved).
let pickedZone: string | null = null;
const listeners = new Set<() => void>();

export function pickTimeZone(zone: string): void {
  pickedZone = zone;
  listeners.forEach((l) => l());
}

export function takePickedTimeZone(): string | null {
  const z = pickedZone;
  pickedZone = null;
  return z;
}

export function usePickedTimeZone(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pickedZone,
  );
}
