import { getTestPrisma } from "./support/db";
import {
  reserveSpend,
  releaseReservation,
  reconcileSpend,
  monthlyCapMicros,
  monthKey,
  ESTIMATED_ATTEMPT_MICROS,
} from "@/lib/import/spend";

/**
 * Workout Plan Import & Review (OVE-109, spec §14.9, blueprint §5) — the global
 * provider-spend ledger (ImportSpendLedger) against the throwaway Postgres.
 *
 * Proves cost governance a forged request cannot defeat:
 *  - FAIL CLOSED when the monthly cap is missing (no cap => no reservation);
 *  - a reserve-before counter that TWO concurrent jobs cannot both push past the
 *    monthly ceiling (the atomic single-statement bump is the guard);
 *  - reconcile-after records observed usage and releases the unused reservation.
 *
 * The ledger is un-owned and raw-SQL only; there is no account here by design.
 */

const CAP = process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;

function setCap(micros: string | null) {
  if (micros === null) delete process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
  else process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = micros;
}

afterEach(async () => {
  // Reset the ledger between cases so reservations don't leak across tests.
  await getTestPrisma().importSpendLedger.deleteMany({});
  if (CAP === undefined) delete process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
  else process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = CAP;
});

describe("fail closed when configuration is missing", () => {
  it("refuses every reservation when the monthly cap is unset", async () => {
    setCap(null);
    expect(monthlyCapMicros()).toBeNull();
    expect(await reserveSpend()).toEqual({ allowed: false });
  });

  it("refuses when the cap is not a positive integer", async () => {
    for (const bad of ["0", "-1", "abc", ""]) {
      setCap(bad);
      expect(await reserveSpend()).toEqual({ allowed: false });
    }
  });
});

describe("reserve-before within the ceiling", () => {
  it("allows reservations up to the cap and refuses the one that would exceed it", async () => {
    // Cap = exactly 3 attempts' worth of the conservative estimate.
    setCap((ESTIMATED_ATTEMPT_MICROS * BigInt(3)).toString());
    expect((await reserveSpend()).allowed).toBe(true);
    expect((await reserveSpend()).allowed).toBe(true);
    expect((await reserveSpend()).allowed).toBe(true);
    // The 4th would exceed the ceiling: refused, and rolled back (no phantom).
    expect((await reserveSpend()).allowed).toBe(false);

    const row = await getTestPrisma().importSpendLedger.findUniqueOrThrow({
      where: { monthKey: monthKey() },
    });
    // Three reservations stand; the refused 4th left nothing behind.
    expect(row.reservedMicros).toBe(ESTIMATED_ATTEMPT_MICROS * BigInt(3));
  });
});

describe("two concurrent jobs cannot both reserve past the ceiling", () => {
  it("at a cap of ONE attempt, exactly one of many concurrent reservations wins", async () => {
    setCap(ESTIMATED_ATTEMPT_MICROS.toString()); // room for exactly one
    const results = await Promise.all(
      Array.from({ length: 8 }, () => reserveSpend()),
    );
    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(1);

    // The ledger never exceeds the cap: the refused attempts rolled back.
    const row = await getTestPrisma().importSpendLedger.findUniqueOrThrow({
      where: { monthKey: monthKey() },
    });
    expect(row.reservedMicros).toBeLessThanOrEqual(ESTIMATED_ATTEMPT_MICROS);
  });
});

describe("reconcile-after", () => {
  it("records observed usage and releases the whole reservation (actual < estimate)", async () => {
    setCap((ESTIMATED_ATTEMPT_MICROS * BigInt(10)).toString());
    await reserveSpend(); // reserves ESTIMATED
    const actual = BigInt(120_000); // cheaper than estimated
    await reconcileSpend({
      reservedMicros: ESTIMATED_ATTEMPT_MICROS,
      actualMicros: actual,
    });
    const row = await getTestPrisma().importSpendLedger.findUniqueOrThrow({
      where: { monthKey: monthKey() },
    });
    expect(row.actualMicros).toBe(actual);
    // The up-front reservation is RELEASED IN FULL; actual is booked separately.
    expect(row.reservedMicros).toBe(BigInt(0));
  });

  it("does NOT inflate reserved when actual EXCEEDS the estimate (sign-error regression)", async () => {
    setCap((ESTIMATED_ATTEMPT_MICROS * BigInt(10)).toString());
    await reserveSpend(); // reserves ESTIMATED ($0.50)
    // The real cost came in ABOVE the conservative estimate. The old formula
    // `reserved -= (reserved - actual)` went negative and INFLATED reserved past
    // what was ever reserved; the fix releases exactly `reservedMicros`.
    const actual = ESTIMATED_ATTEMPT_MICROS * BigInt(2); // $1.00, over estimate
    await reconcileSpend({
      reservedMicros: ESTIMATED_ATTEMPT_MICROS,
      actualMicros: actual,
    });
    const row = await getTestPrisma().importSpendLedger.findUniqueOrThrow({
      where: { monthKey: monthKey() },
    });
    // reserved released in full (floored at 0), NEVER inflated above the reserve.
    expect(row.reservedMicros).toBe(BigInt(0));
    expect(row.actualMicros).toBe(actual);
  });

  it("releasing a reservation never drives reserved below zero", async () => {
    setCap((ESTIMATED_ATTEMPT_MICROS * BigInt(10)).toString());
    await reserveSpend();
    await releaseReservation(ESTIMATED_ATTEMPT_MICROS * BigInt(5));
    const row = await getTestPrisma().importSpendLedger.findUniqueOrThrow({
      where: { monthKey: monthKey() },
    });
    expect(row.reservedMicros).toBe(BigInt(0));
  });
});
