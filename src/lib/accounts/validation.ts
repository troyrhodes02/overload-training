import { isValidTimeZone } from "@/lib/plan/calendar";

/**
 * Pure input rules for account forms (Accounts spec §12). Shared by the
 * server actions (authoritative) and the client forms (early feedback), so it
 * imports nothing server-only.
 */

export const PROFILE_NAME_MAX = 50;
export const EMAIL_MAX = 254;
/**
 * The auth service's minimum password length (Supabase default). Overload has
 * no password rules of its own (spec R6); this only words the helper text and
 * must match the project's setting.
 */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * The message for an auth-service "weak password" refusal, from its reasons
 * (Supabase reports "length", "characters", "pwned"), worded from
 * PASSWORD_MIN_LENGTH so the copy can never drift from it.
 */
export function weakPasswordMessage(reasons?: readonly string[]): string {
  if (!reasons || reasons.length === 0 || reasons.includes("length")) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return "Choose a stronger password.";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NameField = "firstName" | "lastName";

const NAME_LABEL: Record<NameField, string> = {
  firstName: "first name",
  lastName: "last name",
};

/** A trimmed 1–50 character name, or the message for its field. */
export function checkName(
  field: NameField,
  raw: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, message: `Enter your ${NAME_LABEL[field]}.` };
  if (value.length > PROFILE_NAME_MAX) {
    return {
      ok: false,
      message: `Use ${PROFILE_NAME_MAX} characters or fewer.`,
    };
  }
  return { ok: true, value };
}

/** Trimmed, lowercased email of a plausible shape, or the message. */
export function checkEmail(
  raw: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return { ok: false, message: "Enter your email." };
  if (value.length > EMAIL_MAX || !EMAIL_RE.test(value)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  return { ok: true, value };
}

export type ProfileInput = {
  firstName: string;
  lastName: string;
  timeZone: string;
};

export type ProfileParse =
  | { ok: true; value: ProfileInput }
  | { ok: false; details: Partial<Record<keyof ProfileInput, string>> };

/** Settings: both names required, and a real IANA timezone. */
export function parseProfileInput(raw: {
  firstName: unknown;
  lastName: unknown;
  timeZone: unknown;
}): ProfileParse {
  const details: Partial<Record<keyof ProfileInput, string>> = {};
  const first = checkName("firstName", raw.firstName);
  const last = checkName("lastName", raw.lastName);
  if (!first.ok) details.firstName = first.message;
  if (!last.ok) details.lastName = last.message;
  const timeZone = typeof raw.timeZone === "string" ? raw.timeZone.trim() : "";
  if (!isValidTimeZone(timeZone)) details.timeZone = "Choose a timezone.";
  if (!first.ok || !last.ok || details.timeZone) return { ok: false, details };
  return {
    ok: true,
    value: { firstName: first.value, lastName: last.value, timeZone },
  };
}
