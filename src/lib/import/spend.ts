import "server-only";
import { randomUUID } from "node:crypto";
// Workout Plan Import & Review (Pitch 22, spec RD-6/RD-9, OVE-106). The global
// provider-spend ledger (ImportSpendLedger) is UN-OWNED (no account) and holds
// no personal data — only a month bucket and micro-dollar totals. An atomic
// reserve-before / reconcile-after counter cannot be expressed through the
// account-scoped client (there is no account), so this dedicated raw-allowed
// module is the ONLY code that writes it. It mirrors throttle.ts's single-
// statement atomic upsert so parallel extractions, retries, and cold starts can
// never race past the owner-set monthly ceiling.
import { prisma } from "@/lib/db";

/**
 * Reserve-before, reconcile-after global spend ledger (spec §8 derived fields).
 *
 * FAILS CLOSED: if the monthly cap is not configured, or the DB is momentarily
 * unreachable, a reservation is REFUSED (the import surfaces `import_unavailable`
 * rather than opening an unmetered provider call). Choosing the cap AMOUNT is an
 * owner decision (spec §17.1); this module only enforces whatever cap is set and
 * refuses when none is.
 */

/** A conservative per-attempt estimate in micro-dollars ($0.50) reserved up front. */
export const ESTIMATED_ATTEMPT_MICROS = BigInt(500_000);

/** The owner-set monthly ceiling, in micro-dollars, or null when unconfigured. */
export function monthlyCapMicros(): bigint | null {
  const raw = process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS?.trim();
  if (!raw) return null;
  try {
    const value = BigInt(raw);
    return value > BigInt(0) ? value : null;
  } catch {
    return null;
  }
}

/** Current UTC month bucket "YYYY-MM". */
export function monthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Atomically reserve `micros` against this month's ledger and report whether the
 * reservation stays within the cap. The reserve is a single statement that bumps
 * `reserved_micros` and returns the new total, so a concurrent pair can never
 * both reserve past the ceiling.
 *
 * Returns `{ allowed: false }` when the cap is unset, the DB is unreachable, or
 * the reservation would exceed the cap (in which case the reservation is rolled
 * back so a refused attempt leaves no phantom spend).
 */
export async function reserveSpend(
  micros: bigint = ESTIMATED_ATTEMPT_MICROS,
): Promise<{ allowed: boolean }> {
  const cap = monthlyCapMicros();
  if (cap == null) return { allowed: false }; // fail closed: no cap configured
  const key = monthKey();
  try {
    const rows = await prisma.$queryRaw<{ reserved_micros: bigint }[]>`
      INSERT INTO "import_spend_ledger" ("id", "month_key", "reserved_micros", "actual_micros", "created_at", "updated_at")
      VALUES (${randomUUID()}::uuid, ${key}, ${micros}, 0, now(), now())
      ON CONFLICT ("month_key")
      DO UPDATE SET "reserved_micros" = "import_spend_ledger"."reserved_micros" + ${micros}, "updated_at" = now()
      RETURNING "reserved_micros"`;
    const reserved = rows[0]?.reserved_micros ?? cap + BigInt(1);
    if (BigInt(reserved) <= cap) {
      return { allowed: true };
    }
    // Over the cap: roll the reservation back so a refusal leaves no phantom spend.
    await releaseReservation(micros).catch(() => {});
    return { allowed: false };
  } catch {
    return { allowed: false };
  }
}

/** Release a prior reservation (e.g. after a failed/cancelled attempt). */
export async function releaseReservation(micros: bigint): Promise<void> {
  const key = monthKey();
  await prisma.$executeRaw`
    UPDATE "import_spend_ledger"
    SET "reserved_micros" = GREATEST(0, "reserved_micros" - ${micros}), "updated_at" = now()
    WHERE "month_key" = ${key}`;
}

/**
 * Reconcile actual spend after an attempt: records the real cost and releases the
 * unused part of the reservation. Best-effort — a reconciliation failure never
 * fails the import, it only leaves the estimate standing (conservative).
 */
export async function reconcileSpend(input: {
  reservedMicros: bigint;
  actualMicros: bigint;
}): Promise<void> {
  const key = monthKey();
  const delta = input.reservedMicros - input.actualMicros;
  try {
    await prisma.$executeRaw`
      UPDATE "import_spend_ledger"
      SET "actual_micros" = "actual_micros" + ${input.actualMicros},
          "reserved_micros" = GREATEST(0, "reserved_micros" - ${delta}),
          "updated_at" = now()
      WHERE "month_key" = ${key}`;
  } catch {
    // A reconciliation blip leaves the conservative estimate standing.
  }
}
