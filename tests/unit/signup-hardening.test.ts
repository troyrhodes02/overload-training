jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createConfirmedUser: jest.fn(),
  deleteAuthUser: jest.fn(),
}));
jest.mock("@/lib/data/account", () => ({
  DEFAULT_PROFILE_TIME_ZONE: "UTC",
  establishProfile: jest.fn(),
}));
jest.mock("@/lib/data/usernames", () => ({
  isUsernameAvailable: jest.fn(),
}));
// throttle.ts (imported transitively via signup.ts) constructs the raw client
// at module load; in the unit env there is no DATABASE_URL. The throttle is
// always injected as a dep here, so a stub client suffices.
jest.mock("@/lib/db", () => ({ prisma: {} }));

import { signUp, type SignUpDeps } from "@/lib/accounts/signup";
import {
  DEFAULT_SIGNUP_HOURLY_CAP,
  EMAIL_NOT_ACCEPTED,
  isDisposableEmail,
  isReservedUsername,
  isTrialDedupeEnabled,
  normalizeEmailKey,
  signupHourlyCap,
  USERNAME_NOT_AVAILABLE,
} from "@/lib/accounts/signup-guards";

/**
 * Signup hardening (pre-mobile follow-up, items 2a–2d): one trial per person
 * (dark by default), disposable domains, reserved usernames, and a global
 * hourly cap — all neutral to the visitor. Closed mode still closes.
 */

const OPEN = { OVERLOAD_SIGNUP_MODE: "public" };
const DEDUPE = { ...OPEN, TRIAL_DEDUPE_ENABLED: "true" };
const NEW_ID = "c0000000-0000-4000-8000-000000000003";

function deps(overrides: Partial<SignUpDeps> = {}) {
  return {
    checkAndIncrement: jest.fn(async () => ({ allowed: true })),
    verifyChallenge: jest.fn(async () => true),
    isUsernameAvailable: jest.fn(async () => true),
    createConfirmedUser: jest.fn(async () => ({
      ok: true as const,
      user: { id: NEW_ID },
    })),
    deleteAuthUser: jest.fn(async () => "deleted" as const),
    signIn: jest.fn(async () => ({ user: { id: NEW_ID } })),
    signOut: jest.fn(async () => {}),
    establishProfile: jest.fn(async () => {}),
    countRecentSignups: jest.fn(async () => 0),
    claimTrial: jest.fn(async () => true),
    releaseTrialClaim: jest.fn(async () => {}),
    ...overrides,
  } satisfies SignUpDeps;
}

const valid = {
  firstName: "Sam",
  lastName: "Ortiz",
  username: "sam_lifts",
  email: "sam@example.com",
  password: "barbell-315",
  confirmPassword: "barbell-315",
  timeZone: "America/Chicago",
  inviteCode: "",
};

describe("normalizeEmailKey (2a)", () => {
  it.each([
    ["Jane.Doe+trial@GoogleMail.com", "janedoe@gmail.com"],
    ["j.a.n.e.doe@gmail.com", "janedoe@gmail.com"],
    ["janedoe+1@gmail.com", "janedoe@gmail.com"],
    ["Sam.Ortiz+x@Example.com", "sam.ortiz@example.com"],
    ["  SAM@example.com ", "sam@example.com"],
  ])("%s → %s", (input, key) => {
    expect(normalizeEmailKey(input)).toBe(key);
  });

  it("dots are kept outside Gmail", () => {
    expect(normalizeEmailKey("a.b@example.com")).not.toBe(
      normalizeEmailKey("ab@example.com"),
    );
  });

  it.each(["", "no-at", "@example.com", "a@", "a@b@c.com", "+tag@gmail.com"])(
    "%p has no key",
    (input) => {
      expect(normalizeEmailKey(input)).toBeNull();
    },
  );

  it("the flag is off unless exactly true", () => {
    expect(isTrialDedupeEnabled({})).toBe(false);
    expect(isTrialDedupeEnabled({ TRIAL_DEDUPE_ENABLED: "1" })).toBe(false);
    expect(isTrialDedupeEnabled({ TRIAL_DEDUPE_ENABLED: " TRUE " })).toBe(true);
  });
});

describe("disposable domains and reserved usernames (2b, 2c)", () => {
  it("refuses listed domains and their subdomains only", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@inbox.MAILINATOR.com")).toBe(true);
    expect(isDisposableEmail("x@gmail.com")).toBe(false);
    expect(isDisposableEmail("x@notmailinator.com")).toBe(false);
  });

  it.each([
    "admin",
    "Administrator",
    "ad.min",
    "admin2",
    "support",
    "over_load",
    "Overload-Official",
    "root",
    "staff",
    "billing",
  ])("%s is reserved", (u) => {
    expect(isReservedUsername(u)).toBe(true);
  });

  it.each(["sam_lifts", "helper_bob", "rooted", "systematic"])(
    "%s is not reserved",
    (u) => {
      expect(isReservedUsername(u)).toBe(false);
    },
  );
});

describe("signup orchestration", () => {
  it("a disposable email gets a neutral field message and creates nothing", async () => {
    const d = deps();
    expect(
      await signUp({ ...valid, email: "sam@yopmail.com" }, d, OPEN),
    ).toEqual({ kind: "invalid", fieldErrors: { email: EMAIL_NOT_ACCEPTED } });
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("a reserved username gets a neutral field message and creates nothing", async () => {
    const d = deps();
    expect(await signUp({ ...valid, username: "Admin" }, d, OPEN)).toEqual({
      kind: "invalid",
      fieldErrors: { username: USERNAME_NOT_AVAILABLE },
    });
    expect(d.isUsernameAvailable).not.toHaveBeenCalled();
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("the hourly cap pauses signup, logs it, and creates nothing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const d = deps({
      countRecentSignups: jest.fn(async () => DEFAULT_SIGNUP_HOURLY_CAP),
    });
    expect(await signUp(valid, d, OPEN)).toEqual({ kind: "paused" });
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("hourly signup cap reached"),
    );
    warn.mockRestore();
  });

  it("under the cap signup proceeds; the cap counts the last hour", async () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const d = deps({
      countRecentSignups: jest.fn(async () => DEFAULT_SIGNUP_HOURLY_CAP - 1),
      now: () => now,
    });
    expect(await signUp(valid, d, OPEN)).toEqual({ kind: "created" });
    expect(d.countRecentSignups).toHaveBeenCalledWith(
      new Date("2026-11-12T09:00:00Z"),
    );
  });

  it("the cap is configurable", () => {
    expect(signupHourlyCap({})).toBe(30);
    expect(signupHourlyCap({ OVERLOAD_SIGNUP_HOURLY_CAP: "100" })).toBe(100);
    for (const v of ["0", "-5", "abc", "1.5"]) {
      expect(signupHourlyCap({ OVERLOAD_SIGNUP_HOURLY_CAP: v })).toBe(30);
    }
  });

  it("closed mode still refuses before anything is counted", async () => {
    const d = deps();
    expect(await signUp(valid, d, { OVERLOAD_SIGNUP_MODE: "closed" })).toEqual({
      kind: "closed",
    });
    expect(d.countRecentSignups).not.toHaveBeenCalled();
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("with the flag OFF, the trial claim is never touched and the trial is granted", async () => {
    const d = deps();
    expect(await signUp(valid, d, OPEN)).toEqual({ kind: "created" });
    expect(d.claimTrial).not.toHaveBeenCalled();
    expect(d.releaseTrialClaim).not.toHaveBeenCalled();
    expect(d.establishProfile).toHaveBeenCalledWith(
      { id: NEW_ID },
      expect.anything(),
      { grantTrial: true },
    );
  });

  it("with the flag ON, a first claim gets the trial", async () => {
    const d = deps();
    expect(await signUp(valid, d, DEDUPE)).toEqual({ kind: "created" });
    expect(d.claimTrial).toHaveBeenCalledWith("sam@example.com", NEW_ID);
    expect(d.establishProfile).toHaveBeenCalledWith(
      { id: NEW_ID },
      expect.anything(),
      { grantTrial: true },
    );
  });

  it("with the flag ON, a repeat person is created normally on Free, with no error", async () => {
    const d = deps({ claimTrial: jest.fn(async () => false) });
    expect(await signUp(valid, d, DEDUPE)).toEqual({ kind: "created" });
    expect(d.establishProfile).toHaveBeenCalledWith(
      { id: NEW_ID },
      expect.anything(),
      { grantTrial: false },
    );
  });

  it("with the flag ON, a claim failure fails open (the trial is granted)", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      claimTrial: jest.fn(async () => {
        throw new Error('relation "trial_claims" does not exist');
      }),
    });
    expect(await signUp(valid, d, DEDUPE)).toEqual({ kind: "created" });
    expect(d.establishProfile).toHaveBeenCalledWith(
      { id: NEW_ID },
      expect.anything(),
      { grantTrial: true },
    );
    log.mockRestore();
  });

  it("a signup that fails after claiming releases the claim", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      establishProfile: jest.fn(async () => {
        throw new Error("db down");
      }),
    });
    expect(await signUp(valid, d, DEDUPE)).toEqual({ kind: "unexpected" });
    expect(d.releaseTrialClaim).toHaveBeenCalledWith("sam@example.com", NEW_ID);
    log.mockRestore();
  });
});
