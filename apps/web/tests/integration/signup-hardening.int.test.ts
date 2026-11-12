import { randomUUID } from "node:crypto";
import { signUp, type SignUpDeps } from "@/lib/accounts/signup";
import { establishProfile } from "@/lib/data/account";
import { claimTrial, releaseTrialClaim } from "@/lib/data/trial-claims";
import { countRecentSignups } from "@/lib/data/signup-cap";
import { getTestPrisma } from "./support/db";

/**
 * Signup hardening against the real schema (items 2a, 2d): one trial per
 * person through the trial_claims table (only with TRIAL_DEDUPE_ENABLED=true),
 * the flag-off path never touching that table (it works with the table
 * GONE), and the hourly cap counted from existing data.
 */

const db = () => getTestPrisma();
const OPEN = { OVERLOAD_SIGNUP_MODE: "public" };
const DEDUPE = { ...OPEN, TRIAL_DEDUPE_ENABLED: "true" };

/** Real data-layer deps; only the auth service and bot checks are faked. */
function realDeps(): SignUpDeps & { lastId: () => string } {
  let id = "";
  return {
    checkAndIncrement: async () => ({ allowed: true, count: 1 }),
    verifyChallenge: async () => true,
    isUsernameAvailable: async () => true,
    createConfirmedUser: async () => {
      id = randomUUID();
      return { ok: true as const, user: { id } };
    },
    deleteAuthUser: async () => "deleted" as const,
    signIn: async () => ({ user: { id } }),
    signOut: async () => {},
    establishProfile,
    countRecentSignups,
    claimTrial,
    releaseTrialClaim,
    lastId: () => id,
  } as SignUpDeps & { lastId: () => string };
}

const form = (email: string, username: string) => ({
  firstName: "Sam",
  lastName: "Ortiz",
  username,
  email,
  password: "barbell-315",
  confirmPassword: "barbell-315",
  timeZone: "UTC",
  inviteCode: "",
});

const trials = (userId: string) =>
  db().entitlement.count({ where: { userId, source: "trial" } });

describe("one trial per person (2a), flag ON", () => {
  it("a +alias of the same address starts on Free, created normally", async () => {
    const d = realDeps();
    expect(await signUp(form("sam@example.com", "sam_one"), d, DEDUPE)).toEqual(
      { kind: "created" },
    );
    const first = d.lastId();
    expect(
      await signUp(form("Sam+again@Example.com", "sam_two"), d, DEDUPE),
    ).toEqual({ kind: "created" });
    const second = d.lastId();
    expect(await trials(first)).toBe(1);
    expect(await trials(second)).toBe(0);
    // Created normally: the profile exists.
    expect(
      await db().profile.findUnique({ where: { userId: second } }),
    ).not.toBeNull();
  });

  it("Gmail dots and googlemail.com are the same person", async () => {
    const d = realDeps();
    await signUp(form("jane.doe@gmail.com", "jane_one"), d, DEDUPE);
    await signUp(form("janedoe+x@googlemail.com", "jane_two"), d, DEDUPE);
    expect(await trials(d.lastId())).toBe(0);
  });

  it("stores only a hash of the key, never the address", async () => {
    const d = realDeps();
    await signUp(form("sam@example.com", "sam_one"), d, DEDUPE);
    const claims = await db().trialClaim.findMany();
    expect(claims).toHaveLength(1);
    expect(claims[0].keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(claims)).not.toContain("example.com");
  });

  it("a retry by the same account keeps its claim; a release frees it", async () => {
    const a = randomUUID();
    const b = randomUUID();
    expect(await claimTrial("x@example.com", a)).toBe(true);
    expect(await claimTrial("x@example.com", a)).toBe(true);
    expect(await claimTrial("x+1@example.com", b)).toBe(false);
    await releaseTrialClaim("x@example.com", a);
    expect(await claimTrial("x@example.com", b)).toBe(true);
  });
});

describe("flag OFF touches nothing (2a)", () => {
  it("every account keeps its trial and no claim is written", async () => {
    const d = realDeps();
    await signUp(form("sam@example.com", "sam_one"), d, OPEN);
    await signUp(form("sam+2@example.com", "sam_two"), d, OPEN);
    expect(await trials(d.lastId())).toBe(1);
    expect(await db().trialClaim.count()).toBe(0);
  });

  it("signup works unchanged when the trial_claims table does not exist", async () => {
    await db().$executeRawUnsafe(
      `ALTER TABLE "trial_claims" RENAME TO "trial_claims_hidden"`,
    );
    try {
      const d = realDeps();
      expect(await signUp(form("sam@example.com", "sam_one"), d, OPEN)).toEqual(
        { kind: "created" },
      );
      expect(await trials(d.lastId())).toBe(1);

      // And with the flag ON but the table missing, signup fails OPEN.
      const log = jest.spyOn(console, "error").mockImplementation(() => {});
      expect(
        await signUp(form("pat@example.com", "pat_one"), d, DEDUPE),
      ).toEqual({ kind: "created" });
      expect(await trials(d.lastId())).toBe(1);
      log.mockRestore();
    } finally {
      await db().$executeRawUnsafe(
        `ALTER TABLE "trial_claims_hidden" RENAME TO "trial_claims"`,
      );
    }
  });
});

describe("hourly cap (2d)", () => {
  it("counts accounts created since an instant, from existing profiles", async () => {
    const now = new Date();
    await db().profile.createMany({
      data: [
        { userId: randomUUID(), timeZone: "UTC", createdAt: now },
        {
          userId: randomUUID(),
          timeZone: "UTC",
          createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        },
      ],
    });
    expect(
      await countRecentSignups(new Date(now.getTime() - 60 * 60 * 1000)),
    ).toBe(1);
  });

  it("pauses signups at the cap, neutrally, creating nothing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await db().profile.createMany({
      data: Array.from({ length: 2 }, () => ({
        userId: randomUUID(),
        timeZone: "UTC",
      })),
    });
    const d = realDeps();
    const before = await db().profile.count();
    expect(
      await signUp(form("sam@example.com", "sam_one"), d, {
        ...OPEN,
        OVERLOAD_SIGNUP_HOURLY_CAP: "2",
      }),
    ).toEqual({ kind: "paused" });
    expect(await db().profile.count()).toBe(before);
    warn.mockRestore();
  });
});
