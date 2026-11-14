/**
 * Pitch 21c (spec §11; RD-8): the mobile API's per-account rate limit against
 * a real database — the window, the reset, other accounts unaffected, and no
 * raw account id stored.
 */
import {
  checkMobileRateLimit,
  MOBILE_API_RATE_LIMIT,
  MOBILE_API_RATE_WINDOW_SECONDS,
} from "@/lib/api/mobile/rate-limit";
import { checkAndIncrement, clearThrottle } from "@/lib/accounts/throttle";
import { deleteAccount } from "@/lib/accounts/deletion";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";

// A fixed clock 10 s into a window.
const WINDOW_START =
  1_800_000_000 - (1_800_000_000 % MOBILE_API_RATE_WINDOW_SECONDS);
const at = (offsetSeconds: number) => () =>
  (WINDOW_START + offsetSeconds) * 1000;

describe("checkMobileRateLimit", () => {
  it("allows the limit, refuses the next with Retry-After, and resets next window", async () => {
    const a = await createTestAccount();
    for (let i = 0; i < MOBILE_API_RATE_LIMIT; i++) {
      expect(await checkMobileRateLimit(a, at(10))).toBeNull();
    }
    const refused = await checkMobileRateLimit(a, at(10));
    expect(refused).toMatchObject({ code: "rate_limited", status: 429 });
    expect(refused!.headers["Retry-After"]).toBe(
      String(MOBILE_API_RATE_WINDOW_SECONDS - 10),
    );
    expect(
      await checkMobileRateLimit(a, at(MOBILE_API_RATE_WINDOW_SECONDS)),
    ).toBeNull();
  });

  it("is per account: another account is unaffected", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    for (let i = 0; i <= MOBILE_API_RATE_LIMIT; i++) {
      await checkMobileRateLimit(a, at(5));
    }
    expect(await checkMobileRateLimit(a, at(5))).not.toBeNull();
    expect(await checkMobileRateLimit(b, at(5))).toBeNull();
  });

  it("stores only a hash and a count, never the account id", async () => {
    const a = await createTestAccount();
    await checkMobileRateLimit(a, at(1));
    const rows = await getTestPrisma().authThrottle.findMany({
      where: { action: "mobile_api_request" },
    });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(a.userId);
    expect(rows[0].keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("leaves the pre-auth doors' limits unchanged (10 per window)", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await checkAndIncrement("signup", "fp-1", at(2))).allowed).toBe(
        true,
      );
    }
    expect((await checkAndIncrement("signup", "fp-1", at(2))).allowed).toBe(
      false,
    );
  });

  it("keeps at most one row per account: a new window drops the earlier ones", async () => {
    const a = await createTestAccount();
    for (const minute of [0, 1, 2, 3]) {
      await checkMobileRateLimit(
        a,
        at(minute * MOBILE_API_RATE_WINDOW_SECONDS + 1),
      );
    }
    const rows = await getTestPrisma().authThrottle.findMany({
      where: { action: "mobile_api_request" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].windowStart).toBe(
      WINDOW_START + 3 * MOBILE_API_RATE_WINDOW_SECONDS,
    );
  });

  it("the pre-auth doors keep their earlier windows (unchanged behavior)", async () => {
    await checkAndIncrement("signup", "fp-2", at(1));
    await checkAndIncrement(
      "signup",
      "fp-2",
      at(MOBILE_API_RATE_WINDOW_SECONDS + 1),
    );
    expect(
      await getTestPrisma().authThrottle.count({ where: { action: "signup" } }),
    ).toBe(2);
  });

  it("clearThrottle forgets an account's row", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await checkMobileRateLimit(a, at(1));
    await checkMobileRateLimit(b, at(1));
    await clearThrottle("mobile_api_request", a.userId);
    expect(
      await getTestPrisma().authThrottle.count({
        where: { action: "mobile_api_request" },
      }),
    ).toBe(1);
  });

  it("deleting an account forgets its rate-limit row and no other", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await checkMobileRateLimit(a, at(1));
    await checkMobileRateLimit(b, at(1));
    await deleteAccount(a, { deleteAuthUser: async () => "deleted" });
    expect(
      await getTestPrisma().authThrottle.count({
        where: { action: "mobile_api_request" },
      }),
    ).toBe(1);
  });
});
