import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The signup invite gate (Accounts spec R2). One shared code, held only in the
 * server-only `OVERLOAD_INVITE_CODE` environment variable and rotated by
 * changing it. Signup is CLOSED unless a code of at least
 * INVITE_CODE_MIN_LENGTH characters is configured — production's default, and
 * its rollout gate: no code, no signup. The code is never logged, echoed, sent
 * to the browser, or stored.
 */

export const INVITE_CODE_MIN_LENGTH = 12;

type Env = Record<string, string | undefined>;

function configuredCode(env: Env): string | null {
  const code = env.OVERLOAD_INVITE_CODE?.trim() ?? "";
  return code.length >= INVITE_CODE_MIN_LENGTH ? code : null;
}

export function isSignupOpen(env: Env = process.env): boolean {
  return configuredCode(env) !== null;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Constant-time comparison of a submitted code with the configured one
 * (hashing first makes the buffers equal-length, so timingSafeEqual applies
 * and the length of the real code is not revealed by timing either).
 */
export function checkInviteCode(
  candidate: unknown,
  env: Env = process.env,
): "ok" | "missing" | "invalid" | "closed" {
  const code = configuredCode(env);
  if (!code) return "closed";
  const submitted = typeof candidate === "string" ? candidate.trim() : "";
  if (!submitted) return "missing";
  return timingSafeEqual(digest(submitted), digest(code)) ? "ok" : "invalid";
}
