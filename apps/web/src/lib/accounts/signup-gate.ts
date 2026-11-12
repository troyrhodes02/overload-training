import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * The signup door (Public Accounts, spec R1; replaces OVE-50's binary switch).
 * This module is the ONE reader of both `OVERLOAD_SIGNUP_MODE` and the
 * deprecated alias `OVERLOAD_SIGNUP_OPEN`, and the ONE reader of
 * `OVERLOAD_INVITE_CODE`. All three are server-only; the browser never decides
 * the mode and never sees the invite code.
 */
export type SignupMode = "closed" | "invite" | "public";

/**
 * Resolve the current signup mode from the server environment at request time
 * (never baked in at build):
 *
 *   - `OVERLOAD_SIGNUP_MODE` wins when it is one of closed | invite | public.
 *   - Otherwise the deprecated `OVERLOAD_SIGNUP_OPEN` alias is honored:
 *     "true" -> "public", anything else -> "closed". This keeps a mid-migration
 *     environment from silently opening and preserves OVE-50's rollout gate:
 *     unset -- production's default -- resolves to "closed".
 *
 * Invite is the owner's launch config, set explicitly via
 * `OVERLOAD_SIGNUP_MODE=invite`; it is never a silent default.
 */
export function signupMode(
  env: Record<string, string | undefined> = process.env,
): SignupMode {
  const mode = env.OVERLOAD_SIGNUP_MODE?.trim().toLowerCase();
  if (mode === "closed" || mode === "invite" || mode === "public") {
    return mode;
  }
  // Deprecated alias: honored only when the primary var is unset/invalid.
  return env.OVERLOAD_SIGNUP_OPEN?.trim().toLowerCase() === "true"
    ? "public"
    : "closed";
}

/**
 * Whether `code` matches the server-only `OVERLOAD_INVITE_CODE` (invite mode
 * only). The comparison is constant-time, so a wrong code of the right length
 * is indistinguishable from one of the wrong length by timing. Both the typed
 * code and the configured code are trimmed first. A missing or empty configured
 * code never validates (an unset secret must not accidentally admit everyone).
 */
export function isInviteValid(
  code: unknown,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const expected = env.OVERLOAD_INVITE_CODE?.trim();
  if (!expected) return false;
  if (typeof code !== "string") return false;
  const provided = code.trim();
  if (provided.length === 0) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still run a constant-time compare of equal-length buffers so the early
    // return does not leak the expected length through timing.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
