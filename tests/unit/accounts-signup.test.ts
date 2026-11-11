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

import { DomainError } from "@/lib/actions/result";
import { UsernameTakenError } from "@/lib/accounts/username-taken";
import { isInviteValid, signupMode } from "@/lib/accounts/signup-gate";
import { signUp, type SignUpDeps } from "@/lib/accounts/signup";

// Public mode is the env most orchestration cases run under (no code required).
const OPEN = { OVERLOAD_SIGNUP_MODE: "public" };
const INVITE_CODE = "k7Qm-2xVr-9pLw";
const INVITE = {
  OVERLOAD_SIGNUP_MODE: "invite",
  OVERLOAD_INVITE_CODE: INVITE_CODE,
};
const NEW_ID = "b0000000-0000-4000-8000-000000000002";

function deps(overrides: Partial<SignUpDeps> = {}) {
  return {
    // PA2 abuse protection: by default the throttle allows and the challenge
    // passes, so the existing orchestration cases exercise the happy path.
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
    ...overrides,
  } satisfies SignUpDeps;
}

const valid = {
  firstName: " Sam ",
  lastName: "Ortiz",
  username: " @Sam_Lifts ",
  email: " Sam@Example.com ",
  password: "barbell-315",
  confirmPassword: "barbell-315",
  timeZone: "America/Chicago",
  inviteCode: "",
};

describe("signupMode resolution (Public Accounts, R1)", () => {
  it("OVERLOAD_SIGNUP_MODE wins when it is a known value", () => {
    expect(signupMode({ OVERLOAD_SIGNUP_MODE: "closed" })).toBe("closed");
    expect(signupMode({ OVERLOAD_SIGNUP_MODE: "invite" })).toBe("invite");
    expect(signupMode({ OVERLOAD_SIGNUP_MODE: "public" })).toBe("public");
    expect(signupMode({ OVERLOAD_SIGNUP_MODE: " PUBLIC " })).toBe("public");
  });

  it("unset resolves to closed (the production default and rollout gate)", () => {
    expect(signupMode({})).toBe("closed");
    expect(signupMode({ OVERLOAD_SIGNUP_MODE: "bogus" })).toBe("closed");
  });

  it("honors the deprecated OVERLOAD_SIGNUP_OPEN alias only when the mode is unset", () => {
    expect(signupMode({ OVERLOAD_SIGNUP_OPEN: "true" })).toBe("public");
    expect(signupMode({ OVERLOAD_SIGNUP_OPEN: " TRUE " })).toBe("public");
    expect(signupMode({ OVERLOAD_SIGNUP_OPEN: "false" })).toBe("closed");
    expect(signupMode({ OVERLOAD_SIGNUP_OPEN: "1" })).toBe("closed");
    // The primary var always wins over the alias.
    expect(
      signupMode({
        OVERLOAD_SIGNUP_MODE: "closed",
        OVERLOAD_SIGNUP_OPEN: "true",
      }),
    ).toBe("closed");
    expect(
      signupMode({
        OVERLOAD_SIGNUP_MODE: "invite",
        OVERLOAD_SIGNUP_OPEN: "true",
      }),
    ).toBe("invite");
  });
});

describe("isInviteValid (Public Accounts, R1)", () => {
  it("accepts the exact configured code and trims surrounding spaces on both sides", () => {
    expect(isInviteValid(INVITE_CODE, INVITE)).toBe(true);
    expect(isInviteValid(`  ${INVITE_CODE}  `, INVITE)).toBe(true);
    expect(
      isInviteValid(INVITE_CODE, {
        OVERLOAD_INVITE_CODE: `  ${INVITE_CODE}  `,
      }),
    ).toBe(true);
  });

  it("rejects a wrong, empty, missing, or non-string code", () => {
    expect(isInviteValid("wrong", INVITE)).toBe(false);
    expect(isInviteValid("", INVITE)).toBe(false);
    expect(isInviteValid("   ", INVITE)).toBe(false);
    expect(isInviteValid(undefined, INVITE)).toBe(false);
    expect(isInviteValid(123, INVITE)).toBe(false);
    // A case difference is a different code.
    expect(isInviteValid(INVITE_CODE.toUpperCase(), INVITE)).toBe(false);
  });

  it("never validates when no code is configured (an unset secret admits no one)", () => {
    expect(isInviteValid(INVITE_CODE, {})).toBe(false);
    expect(isInviteValid("anything", { OVERLOAD_INVITE_CODE: "" })).toBe(false);
    expect(isInviteValid("anything", { OVERLOAD_INVITE_CODE: "   " })).toBe(
      false,
    );
  });
});

describe("signUp orchestration (OVE-50; Public Accounts invite gate)", () => {
  it("closed: refuses without touching the auth service or the database", async () => {
    const d = deps();
    expect(await signUp(valid, d, {})).toEqual({ kind: "closed" });
    expect(d.isUsernameAvailable).not.toHaveBeenCalled();
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("public mode needs no invite code", async () => {
    const d = deps();
    expect(await signUp(valid, d, OPEN)).toEqual({ kind: "created" });
  });

  it("invite mode: a valid code (checked first) lets a full submit through", async () => {
    const d = deps();
    expect(
      await signUp({ ...valid, inviteCode: ` ${INVITE_CODE} ` }, d, INVITE),
    ).toEqual({ kind: "created" });
    expect(d.createConfirmedUser).toHaveBeenCalled();
  });

  it("invite mode: a wrong or missing code is reported ALONE and creates nothing", async () => {
    for (const inviteCode of ["", "   ", "nope", undefined]) {
      const d = deps();
      // Everything else is also invalid, proving the invite error is shown
      // alone: no field feedback leaks before the code passes.
      const outcome = await signUp(
        {
          firstName: "",
          lastName: "",
          username: "",
          email: "",
          password: "",
          confirmPassword: "",
          timeZone: "",
          inviteCode,
        },
        d,
        INVITE,
      );
      expect(outcome).toEqual({ kind: "invite_invalid" });
      expect(d.isUsernameAvailable).not.toHaveBeenCalled();
      expect(d.createConfirmedUser).not.toHaveBeenCalled();
    }
  });

  it("invite mode: a valid code still subjects the fields to the normal rules", async () => {
    const d = deps();
    const outcome = await signUp(
      { ...valid, inviteCode: INVITE_CODE, email: "not-an-email" },
      d,
      INVITE,
    );
    expect(outcome).toEqual({
      kind: "invalid",
      fieldErrors: { email: expect.any(String) },
    });
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("an empty submit reports every missing field", async () => {
    const d = deps();
    expect(
      await signUp(
        {
          firstName: "",
          lastName: "",
          username: "",
          email: "",
          password: "",
          confirmPassword: "",
          timeZone: "",
          inviteCode: "",
        },
        d,
        OPEN,
      ),
    ).toEqual({
      kind: "invalid",
      fieldErrors: {
        firstName: "Enter your first name.",
        lastName: "Enter your last name.",
        username: "Choose a username.",
        email: "Enter your email.",
        password: "Enter a password.",
      },
    });
    expect(d.isUsernameAvailable).not.toHaveBeenCalled();
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("the password must be typed twice, identically", async () => {
    for (const [confirmPassword, message] of [
      ["", "Enter your password again."],
      ["barbell-316", "Passwords don't match."],
      ["Barbell-315", "Passwords don't match."],
    ]) {
      const d = deps();
      expect(await signUp({ ...valid, confirmPassword }, d, OPEN)).toEqual({
        kind: "invalid",
        fieldErrors: { confirmPassword: message },
      });
      expect(d.createConfirmedUser).not.toHaveBeenCalled();
    }
  });

  it("a malformed or reserved username is refused before anything is looked up", async () => {
    for (const username of [
      "ab",
      "has space",
      "dash-ed",
      "x".repeat(21),
      "Admin",
    ]) {
      const d = deps();
      const outcome = await signUp({ ...valid, username }, d, OPEN);
      expect(outcome).toEqual({
        kind: "invalid",
        fieldErrors: { username: expect.any(String) },
      });
      expect(d.isUsernameAvailable).not.toHaveBeenCalled();
      expect(d.createConfirmedUser).not.toHaveBeenCalled();
    }
  });

  it("a taken username is reported and creates nothing", async () => {
    const d = deps({ isUsernameAvailable: jest.fn(async () => false) });
    expect(await signUp(valid, d, OPEN)).toEqual({
      kind: "invalid",
      fieldErrors: { username: "That username is taken." },
    });
    expect(d.isUsernameAvailable).toHaveBeenCalledWith("sam_lifts");
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("creates a confirmed user, signs in, and writes the profile from the sign-in's user", async () => {
    const d = deps();
    expect(await signUp(valid, d, OPEN)).toEqual({ kind: "created" });
    expect(d.createConfirmedUser).toHaveBeenCalledWith({
      email: "sam@example.com",
      password: "barbell-315",
    });
    expect(d.signIn).toHaveBeenCalledWith("sam@example.com", "barbell-315");
    expect(d.establishProfile).toHaveBeenCalledWith(
      { id: NEW_ID },
      {
        firstName: "Sam",
        lastName: "Ortiz",
        username: "sam_lifts",
        timeZone: "America/Chicago",
      },
    );
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("an unusable device zone falls back to UTC", async () => {
    const d = deps();
    await signUp({ ...valid, timeZone: "Mars/Olympus" }, d, OPEN);
    expect(d.establishProfile).toHaveBeenCalledWith(
      { id: NEW_ID },
      expect.objectContaining({ timeZone: "UTC" }),
    );
  });

  it("maps the auth service's refusals to plain outcomes", async () => {
    const fails = (code: string) =>
      deps({
        createConfirmedUser: jest.fn(async () => ({
          ok: false as const,
          code,
        })),
      });
    expect(await signUp(valid, fails("email_exists"), OPEN)).toEqual({
      kind: "email_taken",
    });
    expect(await signUp(valid, fails("weak_password"), OPEN)).toEqual({
      kind: "invalid",
      fieldErrors: { password: "Use at least 6 characters." },
    });
    expect(await signUp(valid, fails("email_address_invalid"), OPEN)).toEqual({
      kind: "invalid",
      fieldErrors: { email: "Enter a valid email address." },
    });
    expect(await signUp(valid, fails("unexpected_failure"), OPEN)).toEqual({
      kind: "unexpected",
    });
  });

  it("compensates when sign-in or the profile fails: no auth user, no auth session", async () => {
    for (const d of [
      deps({ signIn: jest.fn(async () => null) }),
      deps({
        establishProfile: jest.fn(async () => {
          throw new Error("db down");
        }),
      }),
      deps({ signIn: jest.fn(async () => ({ user: { id: "someone-else" } })) }),
    ]) {
      expect(await signUp(valid, d, OPEN)).toEqual({ kind: "unexpected" });
      expect(d.deleteAuthUser).toHaveBeenCalledWith(NEW_ID);
      expect(d.signOut).toHaveBeenCalled();
    }
  });

  it("losing the username race is compensated and reported as taken", async () => {
    const d = deps({
      establishProfile: jest.fn(async () => {
        throw new UsernameTakenError();
      }),
    });
    expect(await signUp(valid, d, OPEN)).toEqual({
      kind: "invalid",
      fieldErrors: { username: "That username is taken." },
    });
    expect(d.deleteAuthUser).toHaveBeenCalledWith(NEW_ID);
    expect(d.signOut).toHaveBeenCalled();
  });

  it("any other conflict is compensated and reported as unexpected, not as a taken username", async () => {
    const d = deps({
      establishProfile: jest.fn(async () => {
        throw new DomainError("conflict", "Something else conflicted.");
      }),
    });
    expect(await signUp(valid, d, OPEN)).toEqual({ kind: "unexpected" });
    expect(d.deleteAuthUser).toHaveBeenCalledWith(NEW_ID);
  });

  it("never logs the email, names, username, or password", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    await signUp(
      valid,
      deps({
        createConfirmedUser: jest.fn(async () => ({
          ok: false as const,
          code: "unexpected_failure",
        })),
      }),
      OPEN,
    );
    await signUp(
      valid,
      deps({
        establishProfile: jest.fn(async () => {
          throw new Error("sam@example.com sam_lifts");
        }),
      }),
      OPEN,
    );
    const logged = JSON.stringify(log.mock.calls);
    for (const secret of [
      "sam@example.com",
      "Sam",
      "sam_lifts",
      "barbell-315",
    ]) {
      expect(logged).not.toContain(secret);
    }
    log.mockRestore();
  });
});

describe("signUp abuse protection (Public Accounts PA2, R4/R6)", () => {
  it("rate-limited: returns rate_limited and creates nothing (throttle runs before any account work)", async () => {
    const d = deps({
      checkAndIncrement: jest.fn(async () => ({ allowed: false })),
    });
    expect(await signUp(valid, d, OPEN)).toEqual({ kind: "rate_limited" });
    expect(d.verifyChallenge).not.toHaveBeenCalled();
    expect(d.isUsernameAvailable).not.toHaveBeenCalled();
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("challenge failure: returns challenge_failed and creates nothing (verified before any account work)", async () => {
    const d = deps({ verifyChallenge: jest.fn(async () => false) });
    expect(
      await signUp({ ...valid, challengeToken: "faked" }, d, OPEN),
    ).toEqual({ kind: "challenge_failed" });
    expect(d.isUsernameAvailable).not.toHaveBeenCalled();
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("throttle is checked BEFORE the challenge, and both run on the signup action key", async () => {
    const order: string[] = [];
    const d = deps({
      checkAndIncrement: jest.fn(async (action) => {
        order.push(`throttle:${action}`);
        return { allowed: true };
      }),
      verifyChallenge: jest.fn(async () => {
        order.push("challenge");
        return true;
      }),
    });
    await signUp(
      { ...valid, challengeToken: "tok", throttleKey: "ip:1.2.3.4" },
      d,
      OPEN,
    );
    expect(order).toEqual(["throttle:signup", "challenge"]);
    expect(d.checkAndIncrement).toHaveBeenCalledWith("signup", "ip:1.2.3.4");
    expect(d.verifyChallenge).toHaveBeenCalledWith("tok");
  });

  it("falls back to a stable non-identifying key when no fingerprint is supplied", async () => {
    const d = deps();
    await signUp({ ...valid, throttleKey: undefined }, d, OPEN);
    expect(d.checkAndIncrement).toHaveBeenCalledWith("signup", "unknown");
  });

  it("abuse checks run only after a valid invite code in invite mode (a codeless visitor is not even throttled on the challenge)", async () => {
    const d = deps();
    // A wrong code short-circuits before the throttle/challenge.
    await signUp({ ...valid, inviteCode: "nope" }, d, INVITE);
    expect(d.checkAndIncrement).not.toHaveBeenCalled();
    expect(d.verifyChallenge).not.toHaveBeenCalled();
  });
});
