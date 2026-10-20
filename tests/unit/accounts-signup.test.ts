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

import { DomainError } from "@/lib/actions/result";
import { UsernameTakenError } from "@/lib/accounts/username-taken";
import { isSignupOpen } from "@/lib/accounts/signup-gate";
import { signUp, type SignUpDeps } from "@/lib/accounts/signup";

const OPEN = { OVERLOAD_SIGNUP_OPEN: "true" };
const NEW_ID = "b0000000-0000-4000-8000-000000000002";

function deps(overrides: Partial<SignUpDeps> = {}) {
  return {
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
};

describe("signup switch (OVE-50)", () => {
  it("is open only when OVERLOAD_SIGNUP_OPEN is true", () => {
    expect(isSignupOpen({})).toBe(false);
    expect(isSignupOpen({ OVERLOAD_SIGNUP_OPEN: "" })).toBe(false);
    expect(isSignupOpen({ OVERLOAD_SIGNUP_OPEN: "false" })).toBe(false);
    expect(isSignupOpen({ OVERLOAD_SIGNUP_OPEN: "1" })).toBe(false);
    expect(isSignupOpen({ OVERLOAD_SIGNUP_OPEN: "yes" })).toBe(false);
    expect(isSignupOpen(OPEN)).toBe(true);
    expect(isSignupOpen({ OVERLOAD_SIGNUP_OPEN: " TRUE " })).toBe(true);
  });

  it("an old invite code no longer opens signup", () => {
    expect(isSignupOpen({ OVERLOAD_INVITE_CODE: "k7Qm-2xVr-9pLw" })).toBe(
      false,
    );
  });
});

describe("signUp orchestration (OVE-50)", () => {
  it("closed: refuses without touching the auth service or the database", async () => {
    const d = deps();
    expect(await signUp(valid, d, {})).toEqual({ kind: "closed" });
    expect(d.isUsernameAvailable).not.toHaveBeenCalled();
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("needs no invite code", async () => {
    const d = deps();
    expect(await signUp(valid, d, OPEN)).toEqual({ kind: "created" });
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
