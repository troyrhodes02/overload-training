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

/** Which pre-auth endpoint an attempt counts against. Mirrors the DB enum. */
export type ThrottleAction = "signup" | "password_reset_request";

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

/** The start of the current fixed window, as epoch seconds. */
function currentWindowStart(nowMs: number): number {
  const nowSeconds = Math.floor(nowMs / 1000);
  return nowSeconds - (nowSeconds % THROTTLE_WINDOW_SECONDS);
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
export async function checkAndIncrement(
  action: ThrottleAction,
  rawKey: string,
  now: () => number = Date.now,
): Promise<{ allowed: boolean }> {
  const keyHash = hashKey(action, rawKey);
  const windowStart = currentWindowStart(now());

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

    const count = Number(rows[0]?.count ?? THROTTLE_LIMIT + 1);
    return { allowed: count <= THROTTLE_LIMIT };
  } catch {
    // The limiter could not reach the database. Refuse rather than let the
    // error escape (never logging the raw key or any address). Callers treat a
    // refusal identically to a tripped limit.
    return { allowed: false };
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
