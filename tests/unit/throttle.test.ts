// The throttle is the one sanctioned raw-client user outside src/lib/data; stub
// the raw client so this unit test exercises the window math and the
// allowed/blocked decision without a database. Real atomicity is proven in the
// integration suite (throttle.int.test.ts).
const queryRaw = jest.fn();
jest.mock("@/lib/db", () => ({ prisma: { $queryRaw: queryRaw } }));

import {
  checkAndIncrement,
  THROTTLE_LIMIT,
  THROTTLE_WINDOW_SECONDS,
} from "@/lib/accounts/throttle";

/** The tagged-template call records the interpolated values as its args. */
function lastValues(): unknown[] {
  const call = queryRaw.mock.calls.at(-1)!;
  return call.slice(1);
}

describe("checkAndIncrement (Public Accounts, R4/R5)", () => {
  beforeEach(() => queryRaw.mockReset());

  it("defaults to a 60s window and a 10/window limit", () => {
    expect(THROTTLE_WINDOW_SECONDS).toBe(60);
    expect(THROTTLE_LIMIT).toBe(10);
  });

  it("allows while the running count is at or below the limit, blocks once above", async () => {
    for (let count = 1; count <= THROTTLE_LIMIT; count++) {
      queryRaw.mockResolvedValueOnce([{ count }]);
      await expect(checkAndIncrement("signup", "k")).resolves.toEqual({
        allowed: true,
      });
    }
    queryRaw.mockResolvedValueOnce([{ count: THROTTLE_LIMIT + 1 }]);
    await expect(checkAndIncrement("signup", "k")).resolves.toEqual({
      allowed: false,
    });
  });

  it("floors 'now' to the fixed window start (epoch seconds) and passes it to the upsert", async () => {
    queryRaw.mockResolvedValue([{ count: 1 }]);
    // 123_456.789s past a window boundary → window start is the multiple below.
    const nowMs = 123_456 * 1000 + 789;
    const expectedWindowStart = 123_456 - (123_456 % THROTTLE_WINDOW_SECONDS); // 123_420
    await checkAndIncrement("signup", "k", () => nowMs);
    const values = lastValues();
    expect(values).toContain(expectedWindowStart);
  });

  it("never sends the raw key to the database — only a SHA-256 hex (R5)", async () => {
    queryRaw.mockResolvedValue([{ count: 1 }]);
    await checkAndIncrement("password_reset_request", "person@example.com");
    const values = lastValues();
    // The raw email appears nowhere; the key is a 64-char hex digest instead.
    for (const v of values) {
      expect(String(v)).not.toContain("person@example.com");
    }
    const hex = values.find(
      (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v),
    );
    expect(hex).toBeDefined();
  });

  it("distinct actions and keys hash to distinct buckets", async () => {
    queryRaw.mockResolvedValue([{ count: 1 }]);
    await checkAndIncrement("signup", "k");
    const a = lastValues().find(
      (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v),
    );
    await checkAndIncrement("password_reset_request", "k");
    const b = lastValues().find(
      (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v),
    );
    await checkAndIncrement("signup", "other");
    const c = lastValues().find(
      (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v),
    );
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("fails closed if the upsert returns no row (treats as over the limit)", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(checkAndIncrement("signup", "k")).resolves.toEqual({
      allowed: false,
    });
  });

  it("fails closed when the DB throws — the error never escapes (review #4)", async () => {
    // A momentary DB outage must not turn a recovery request into a 500 or a
    // different, membership-leaking response. The throttle swallows the throw
    // and refuses the attempt, which recovery folds into the identical "sent"
    // state and signup surfaces as the normal rate-limited message.
    queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    await expect(
      checkAndIncrement("password_reset_request", "k"),
    ).resolves.toEqual({ allowed: false });
  });
});
