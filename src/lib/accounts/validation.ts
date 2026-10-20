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

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-z0-9_]+$/;

/**
 * Names nobody may take: they could later pass for Overload itself or for a
 * route. Compared after normalizing, so case doesn't matter.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "administrator",
  "help",
  "me",
  "moderator",
  "null",
  "official",
  "overload",
  "root",
  "settings",
  "staff",
  "support",
  "system",
  "undefined",
]);

/** The rule as the forms show it, so the copy can't drift from the check. */
export const USERNAME_HELP = `${USERNAME_MIN}–${USERNAME_MAX} characters: lowercase letters, numbers, and underscores.`;

/** How a typed username is stored: trimmed, a leading "@" dropped, lowercase. */
export function normalizeUsername(raw: unknown): string {
  return (typeof raw === "string" ? raw.trim() : "")
    .replace(/^@/, "")
    .toLowerCase();
}

/**
 * A username, trimmed and lowercased (a leading "@" is dropped), of the shape
 * the database CHECK constraint enforces (`^[a-z0-9_]{3,20}$`). Stored
 * lowercase, so "Will" and "will" are the same username. Availability is a
 * separate, server-only question.
 */
export function checkUsername(
  raw: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = normalizeUsername(raw);
  if (!value) return { ok: false, message: "Choose a username." };
  // The helper text already states the rule; each message names the one
  // part that failed.
  if (!USERNAME_RE.test(value)) {
    return {
      ok: false,
      message: "Use only letters, numbers, and underscores.",
    };
  }
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX) {
    return {
      ok: false,
      message: `Use ${USERNAME_MIN} to ${USERNAME_MAX} characters.`,
    };
  }
  if (RESERVED_USERNAMES.has(value)) {
    return { ok: false, message: "That username isn't available." };
  }
  return { ok: true, value };
}

export const USERNAME_TAKEN = "That username is taken.";
export const PASSWORDS_DIFFER = "Passwords don't match.";

export type ProfileInput = {
  firstName: string;
  lastName: string;
  username: string;
  timeZone: string;
};

export type ProfileParse =
  | { ok: true; value: ProfileInput }
  | { ok: false; details: Partial<Record<keyof ProfileInput, string>> };

/**
 * Settings: both names and a username required (an account made before
 * usernames picks one on its first save), and a real IANA timezone.
 */
export function parseProfileInput(raw: {
  firstName: unknown;
  lastName: unknown;
  username: unknown;
  timeZone: unknown;
}): ProfileParse {
  const details: Partial<Record<keyof ProfileInput, string>> = {};
  const first = checkName("firstName", raw.firstName);
  const last = checkName("lastName", raw.lastName);
  const username = checkUsername(raw.username);
  if (!first.ok) details.firstName = first.message;
  if (!last.ok) details.lastName = last.message;
  if (!username.ok) details.username = username.message;
  const timeZone = typeof raw.timeZone === "string" ? raw.timeZone.trim() : "";
  if (!isValidTimeZone(timeZone)) details.timeZone = "Choose a timezone.";
  if (!first.ok || !last.ok || !username.ok || details.timeZone) {
    return { ok: false, details };
  }
  return {
    ok: true,
    value: {
      firstName: first.value,
      lastName: last.value,
      username: username.value,
      timeZone,
    },
  };
}
