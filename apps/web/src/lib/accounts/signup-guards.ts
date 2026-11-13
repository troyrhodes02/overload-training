import { DISPOSABLE_EMAIL_DOMAINS } from "./disposable-domains";
import { RESERVED_USERNAMES } from "./validation";

/**
 * Signup hardening (pre-mobile follow-up, items 2a–2d). Pure: no database,
 * framework, or environment read except through the `env` argument, so each
 * rule is tested on its own and a future native signup reuses it.
 *
 * Every refusal here is NEUTRAL: it asks for a different value or to try
 * again later, and never says why in a way that reveals another account, a
 * list, or a limit.
 */

export {
  EMAIL_NOT_ACCEPTED,
  SIGNUPS_PAUSED,
  USERNAME_NOT_AVAILABLE,
} from "./signup-messages";

// ── 2a: one trial per person ───────────────────────────────────────────────

/** Domains whose mailboxes ignore dots in the local part. */
const DOTLESS_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * The person key for "one trial per person": lowercase, the `+suffix`
 * dropped, and for Gmail the dots removed and googlemail.com folded into
 * gmail.com — so `Jane.Doe+trial@GoogleMail.com` and `janedoe@gmail.com`
 * share one key. Null for anything that isn't a single-@ address.
 */
export function normalizeEmailKey(email: string): string | null {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at !== value.indexOf("@") || at === value.length - 1) {
    return null;
  }
  let local = value.slice(0, at);
  let domain = value.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (DOTLESS_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  if (!local) return null;
  return `${local}@${domain}`;
}

/** One-trial-per-person runs only when explicitly enabled (default off). */
export function isTrialDedupeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.TRIAL_DEDUPE_ENABLED?.trim().toLowerCase() === "true";
}

// ── 2b: disposable email domains ──────────────────────────────────────────

const DISPOSABLE = new Set(
  DISPOSABLE_EMAIL_DOMAINS.map((d) => d.toLowerCase()),
);

/** True when the address's domain, or a parent of it, is on the list. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const labels = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (DISPOSABLE.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

// ── 2c: reserved usernames ────────────────────────────────────────────────

/**
 * Extra names reserved AT SIGNUP, on top of the base list every username
 * check uses (RESERVED_USERNAMES in ./validation, which also guards profile
 * edits). Kept separate so an existing account whose username is on this
 * newer list can still save its profile. Easy to edit.
 */
export const SIGNUP_RESERVED_USERNAMES: readonly string[] = [
  "billing",
  "contact",
  "helpdesk",
  "info",
  "mod",
  "owner",
  "security",
  "team",
];

/** Prefixes that are reserved in any form ("admin2", "overload_team"). */
const RESERVED_PREFIXES = ["admin", "overload"];

const RESERVED = new Set([...RESERVED_USERNAMES, ...SIGNUP_RESERVED_USERNAMES]);

/**
 * Reserved, ignoring case and separators: "Admin", "ad.min", "over_load",
 * "Overload-Official" and "administrator1" are all reserved.
 */
export function isReservedUsername(username: string): boolean {
  const bare = username.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!bare) return false;
  return (
    RESERVED.has(bare) || RESERVED_PREFIXES.some((p) => bare.startsWith(p))
  );
}

// ── 2d: global hourly signup cap ──────────────────────────────────────────

/**
 * Default ceiling on successful signups across all accounts in a rolling
 * hour. Conservative for a small product: a real launch-day spike pauses
 * briefly and recovers within the hour, while a scripted flood stops at 30.
 */
export const DEFAULT_SIGNUP_HOURLY_CAP = 30;

/** The cap in force: OVERLOAD_SIGNUP_HOURLY_CAP (a positive whole number) or the default. */
export function signupHourlyCap(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.OVERLOAD_SIGNUP_HOURLY_CAP?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1) return n;
  }
  return DEFAULT_SIGNUP_HOURLY_CAP;
}
