import "server-only";
import { createHash } from "node:crypto";
import type { AuthThrottleAction } from "@prisma/client";
// Public Accounts R4/R5: the pre-auth rate limiter throttles attempts for which
// no account or session exists yet, so it cannot go through the account-scoped
// layer. AuthThrottle is un-owned (scopeArgs refuses it) and holds NO personal
// data — only a SHA-256 hash of the key and a window bucket. This dedicated
// raw-allowed module is the ONLY code that touches the table; it is the one
// sanctioned raw-client exception outside src/lib/data (eslint ignore-list
// entry + guard test in account-isolation-guards.test.ts).
import { prisma } from "@/lib/db";

/**
 * Server-enforced abuse protection for the public pre-auth doors (signup and,
 * in PA4, forgot-password) — a DB-backed fixed-window rate limiter (Public
 * Accounts, spec §9, R4/R5). No cache or queue: CLAUDE.md rules those out, and
 * the data is tiny. Concurrency-safe by construction — the bump-and-check is a
 * single atomic `INSERT … ON CONFLICT … DO UPDATE SET count = count + 1
 * RETURNING count`, so parallel retries and cold starts can never undercount.
 *
 * The table is un-owned and carries no email, name, or training content: the
 * key is SHA-256-hashed before it ever reaches the database, so a rate-limit
 * decision reveals nothing about any address and the stored row is opaque.
 */

/**
 * What an attempt counts against. Mirrors the DB enum. The two pre-auth doors
 * key on a request fingerprint or an email; the mobile API (Pitch 21c) keys on
 * the verified account id — never an IP, which carrier networks share.
 */
export type ThrottleAction =
  "signup" | "password_reset_request" | "mobile_api_request";

/**
 * Fixed-window length, in seconds. Attempts are bucketed by `floor(now /
 * WINDOW) * WINDOW`; the window advances on its own with wall-clock time (no
 * job prunes old rows — the `created_at` index exists for a future sweep).
 */
export const THROTTLE_WINDOW_SECONDS = 60;

/**
 * Allowed attempts per key per window (R4 default: 10/min). The Nth attempt is
 * allowed; the (N+1)th in the same window is refused.
 */
export const THROTTLE_LIMIT = 10;

/**
 * The mobile API's per-account limit (Pitch 21c spec §11, RD-8): 120 requests
 * a minute — far above a real workout, low enough to stop a runaway client.
 */
export const MOBILE_API_RATE_LIMIT = 120;
export const MOBILE_API_RATE_WINDOW_SECONDS = 60;

/** Each action's fixed window and limit. The pre-auth doors are unchanged. */
export const THROTTLE_POLICIES: Readonly<
  Record<ThrottleAction, { limit: number; windowSeconds: number }>
> = {
  signup: { limit: THROTTLE_LIMIT, windowSeconds: THROTTLE_WINDOW_SECONDS },
  password_reset_request: {
    limit: THROTTLE_LIMIT,
    windowSeconds: THROTTLE_WINDOW_SECONDS,
  },
  mobile_api_request: {
    limit: MOBILE_API_RATE_LIMIT,
    windowSeconds: MOBILE_API_RATE_WINDOW_SECONDS,
  },
};

/** The start of the current fixed window, as epoch seconds. */
function currentWindowStart(nowMs: number, windowSeconds: number): number {
  const nowSeconds = Math.floor(nowMs / 1000);
  return nowSeconds - (nowSeconds % windowSeconds);
}

/**
 * SHA-256 hex of `${action}:${rawKey}`. The raw key (a request fingerprint or,
 * for recovery, the email) never reaches the database — only this opaque digest
 * does, so the throttle row holds no personal data (R5).
 */
function hashKey(action: ThrottleAction, rawKey: string): string {
  return createHash("sha256").update(`${action}:${rawKey}`).digest("hex");
}

/**
 * Atomically record one attempt for `(action, rawKey)` and report whether it
 * is within the limit (the pre-auth doors' interface, unchanged). See
 * throttleRequest for the full behavior.
 */
export async function checkAndIncrement(
  action: ThrottleAction,
  rawKey: string,
  now: () => number = Date.now,
): Promise<{ allowed: boolean }> {
  const { allowed } = await throttleRequest(action, rawKey, now);
  return { allowed };
}

/**
 * Atomically record one attempt for `(action, rawKey)` in the current window
 * and report whether it is within the limit. The whole bump-and-check is one
 * statement, so concurrent callers each see a distinct, monotonically
 * increasing count and the limit cannot be raced past.
 *
 * Returns `{ allowed: true }` while the running count for the window is at or
 * below {@link THROTTLE_LIMIT}, and `{ allowed: false }` once it exceeds it.
 *
 * FAIL CLOSED (review #4): if the DB is momentarily unreachable and the upsert
 * throws, the error is caught here and the attempt is refused (`allowed:
 * false`). A throw must never escape — recovery folds `allowed: false` into the
 * identical `{ sent: true }` "Check your email" response (so a DB blip can
 * never turn a recovery request into a 500 or a different, membership-leaking
 * response), and signup surfaces it as the normal rate-limited message. Failing
 * closed on an abuse limiter is the safe default: a transient blip throttles
 * briefly rather than opening the pre-auth door.
 */
export async function throttleRequest(
  action: ThrottleAction,
  rawKey: string,
  now: () => number = Date.now,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { limit, windowSeconds } = THROTTLE_POLICIES[action];
  const keyHash = hashKey(action, rawKey);
  const nowMs = now();
  const windowStart = currentWindowStart(nowMs, windowSeconds);
  // Whole seconds until this window closes (at least 1).
  const retryAfterSeconds = Math.max(
    1,
    windowStart + windowSeconds - Math.floor(nowMs / 1000),
  );

  try {
    // Single-statement atomic upsert. ON CONFLICT on the composite primary key
    // (key_hash, action, window_start) increments in place; the RETURNING
    // clause hands back the post-increment count so the decision needs no
    // second read.
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "auth_throttle" ("key_hash", "action", "window_start", "count", "created_at", "updated_at")
      VALUES (${keyHash}, ${action}::"auth_throttle_action", ${windowStart}, 1, now(), now())
      ON CONFLICT ("key_hash", "action", "window_start")
      DO UPDATE SET "count" = "auth_throttle"."count" + 1, "updated_at" = now()
      RETURNING "count"`;

    const count = Number(rows[0]?.count ?? limit + 1);
    return { allowed: count <= limit, retryAfterSeconds };
  } catch {
    // The limiter could not reach the database. Refuse rather than let the
    // error escape (never logging the raw key or any address). Callers treat a
    // refusal identically to a tripped limit.
    return { allowed: false, retryAfterSeconds };
  }
}

// A compile-time check that ThrottleAction stays in lockstep with the Prisma
// enum: a renamed or dropped value fails the build rather than at runtime.
const _actionsMatch: ThrottleAction extends AuthThrottleAction
  ? AuthThrottleAction extends ThrottleAction
    ? true
    : never
  : never = true;
void _actionsMatch;
