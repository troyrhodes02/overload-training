import { getTestPrisma } from "./support/db";
import { defaultAccount } from "./support/accounts";
import {
  checkAndIncrement,
  THROTTLE_LIMIT,
  THROTTLE_WINDOW_SECONDS,
} from "@/lib/accounts/throttle";
import { AccountScopeError } from "@/lib/data/scope";
import type { Account } from "@/lib/data/account";

/**
 * The pre-auth rate limiter against a real Postgres (Public Accounts PA2,
 * R4/R5). Proves the bump-and-check is atomic under concurrency, that the fixed
 * window advances, that the table holds no personal data, and that it is
 * unreachable through the account-scoped client.
 */
describe("auth throttle (integration)", () => {
  it("counts up atomically and blocks the (limit+1)th attempt in the window", async () => {
    const now = () => 1_000_000 * 1000; // fixed window
    for (let i = 1; i <= THROTTLE_LIMIT; i++) {
      await expect(checkAndIncrement("signup", "k", now)).resolves.toEqual({
        allowed: true,
      });
    }
    await expect(checkAndIncrement("signup", "k", now)).resolves.toEqual({
      allowed: false,
    });
  });

  it("concurrent increments never undercount (the upsert is a single atomic statement)", async () => {
    const now = () => 2_000_040 * 1000; // a window boundary (divisible by 60)
    const N = 25;
    const results = await Promise.all(
      Array.from({ length: N }, () => checkAndIncrement("signup", "race", now)),
    );
    // Exactly one row exists for this (key, action, window) with count === N:
    // no lost updates, even with N parallel upserts sharing the pool.
    const rows = await getTestPrisma().authThrottle.findMany({
      where: { action: "signup" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(N);
    // And exactly THROTTLE_LIMIT of the N calls were allowed.
    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(THROTTLE_LIMIT);
  });

  it("a new fixed window resets the count (limits are per window, not cumulative)", async () => {
    const base = 3_000_000;
    const w1 = () => base * 1000;
    const w2 = () => (base + THROTTLE_WINDOW_SECONDS) * 1000;
    await checkAndIncrement("signup", "roll", w1);
    await checkAndIncrement("signup", "roll", w2);
    const rows = await getTestPrisma().authThrottle.findMany({
      where: { action: "signup" },
      orderBy: { windowStart: "asc" },
    });
    // Two distinct window buckets, each counted independently.
    const forKey = rows.filter((r) => r.count === 1);
    expect(forKey.length).toBeGreaterThanOrEqual(2);
    expect(forKey[0].windowStart).toBe(base);
    expect(forKey.at(-1)!.windowStart).toBe(base + THROTTLE_WINDOW_SECONDS);
  });

  it("stores only a SHA-256 hash and an action/window — never the raw key", async () => {
    await checkAndIncrement("password_reset_request", "victim@example.com");
    const rows = await getTestPrisma().authThrottle.findMany({
      where: { action: "password_reset_request" },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
      // The raw email never lands in any column.
      expect(JSON.stringify(row)).not.toContain("victim@example.com");
    }
  });

  it("the anon role (Data API) reads nothing even when a throttle row exists (deny-all RLS)", async () => {
    const prisma = getTestPrisma();
    await checkAndIncrement("signup", "someone");
    const owner = await prisma.authThrottle.count();
    expect(owner).toBeGreaterThan(0);

    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
           CREATE ROLE anon NOLOGIN;
         END IF;
       END $$;`,
    );
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon`);
    await prisma.$executeRawUnsafe(`GRANT SELECT ON "auth_throttle" TO anon`);
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE anon");
      return tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "auth_throttle"`,
      );
    });
    expect(Number(rows[0].n)).toBe(0);
  });

  it("is UNREACHABLE through the account-scoped client (no userId; refused by scopeArgs)", async () => {
    const account: Account = await defaultAccount();
    // AuthThrottle is not on the account-scoped client type; reaching it requires
    // casting, which the scope extension still refuses at runtime.
    const db = account.db as unknown as {
      authThrottle: { findMany: () => Promise<unknown> };
    };
    await expect(db.authThrottle.findMany()).rejects.toBeInstanceOf(
      AccountScopeError,
    );
  });
});
