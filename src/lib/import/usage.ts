import "server-only";
import { randomUUID } from "node:crypto";
// Workout Plan Import & Review (Pitch 22, spec RD-9). The per-account daily
// import quota is an atomic counter modeled on src/lib/accounts/throttle.ts:
// the bump-and-check is a single `INSERT ... ON CONFLICT ... DO UPDATE SET
// count = count + 1 RETURNING count`, so parallel tabs, retries, and cold
// starts can never race past the cap. Unlike throttle's un-owned table,
// import_usage_days is OWNED (carries user_id) — but an atomic upsert counter
// cannot be expressed through the account-scoped client without a read-modify-
// write race, so this dedicated raw-allowed module is the ONLY code that writes
// it, and it stamps and filters user_id itself on every statement so no other
// account's row is ever touched (eslint raw-allow entry + guard test enforce
// this is the only non-data-layer raw toucher besides the throttle limiter).
import { prisma } from "@/lib/db";
import { MAX_IMPORTS_PER_DAY } from "./constants";

/**
 * Atomically record one STARTED import attempt for `(userId, dayKey)` and
 * report whether it is within the daily cap. `dayKey` is the account-local
 * calendar day "YYYY-MM-DD" (computed from the account's own timezone by the
 * caller, like lastActiveOn) — never the server's zone.
 *
 * Returns `{ allowed: true }` while the running count for the day is at or below
 * {@link MAX_IMPORTS_PER_DAY}, and `{ allowed: false }` once it exceeds it. The
 * Nth attempt is allowed; the (N+1)th in the same day is refused.
 *
 * FAIL CLOSED: if the DB is momentarily unreachable and the upsert throws, the
 * error is caught here and the attempt is refused (`allowed: false`). A throw
 * must never escape — the caller surfaces a refusal as the normal daily-cap
 * message. Failing closed on a quota is the safe default: a transient blip
 * briefly throttles rather than opening an unmetered provider call.
 */
export async function bumpImportUsage(
  userId: string,
  dayKey: string,
): Promise<{ allowed: boolean }> {
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "import_usage_days" ("id", "user_id", "day_key", "count", "created_at", "updated_at")
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${dayKey}, 1, now(), now())
      ON CONFLICT ("user_id", "day_key")
      DO UPDATE SET "count" = "import_usage_days"."count" + 1, "updated_at" = now()
      RETURNING "count"`;

    const count = Number(rows[0]?.count ?? MAX_IMPORTS_PER_DAY + 1);
    return { allowed: count <= MAX_IMPORTS_PER_DAY };
  } catch {
    // The quota counter could not reach the database. Refuse rather than let the
    // error escape (never logging the account id). A refusal is treated exactly
    // like a tripped cap.
    return { allowed: false };
  }
}
