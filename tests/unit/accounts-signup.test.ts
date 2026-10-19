import crypto from "node:crypto";

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

import {
  checkInviteCode,
  INVITE_CODE_MIN_LENGTH,
  isSignupOpen,
} from "@/lib/accounts/invite";
import { signUp, type SignUpDeps } from "@/lib/accounts/signup";

const CODE = "k7Qm-2xVr-9pLw";
const OPEN = { OVERLOAD_INVITE_CODE: CODE };
const NEW_ID = "b0000000-0000-4000-8000-000000000002";

function deps(overrides: Partial<SignUpDeps> = {}) {
  return {
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
  inviteCode: CODE,
  firstName: " Sam ",
  lastName: "Ortiz",
  email: " Sam@Example.com ",
  password: "barbell-315",
  timeZone: "America/Chicago",
};

describe("invite gate (spec R2)", () => {
  it("is closed when no code, or a code shorter than the minimum, is configured", () => {
    expect(isSignupOpen({})).toBe(false);
    expect(isSignupOpen({ OVERLOAD_INVITE_CODE: "   " })).toBe(false);
    expect(
      isSignupOpen({
        OVERLOAD_INVITE_CODE: "x".repeat(INVITE_CODE_MIN_LENGTH - 1),
      }),
    ).toBe(false);
    expect(checkInviteCode(CODE, {})).toBe("closed");
    expect(isSignupOpen(OPEN)).toBe(true);
  });

  it("missing, wrong, trimmed-right, and case are distinguished on the server only", () => {
    expect(checkInviteCode(undefined, OPEN)).toBe("missing");
    expect(checkInviteCode("   ", OPEN)).toBe("missing");
    expect(checkInviteCode("friends2026", OPEN)).toBe("invalid");
    expect(checkInviteCode(CODE.toLowerCase(), OPEN)).toBe("invalid");
    expect(checkInviteCode(`  ${CODE} `, OPEN)).toBe("ok");
    expect(checkInviteCode(CODE, { OVERLOAD_INVITE_CODE: `  ${CODE}  ` })).toBe(
      "ok",
    );
  });

  it("compares in constant time", () => {
    const spy = jest.spyOn(crypto, "timingSafeEqual");
    checkInviteCode("wrong-but-long-enough", OPEN);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("signUp orchestration (spec §11)", () => {
  it("closed: refuses without touching the auth service", async () => {
    const d = deps();
    expect(await signUp(valid, d, {})).toEqual({ kind: "closed" });
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("a wrong code is the ONLY error, and no account lookup happens", async () => {
    const d = deps();
    const outcome = await signUp(
      { ...valid, inviteCode: "friends2026", email: "", firstName: "" },
      d,
      OPEN,
    );
    expect(outcome).toEqual({
      kind: "invalid",
      fieldErrors: { inviteCode: "That invite code isn't valid." },
    });
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("an empty submit reports every missing field", async () => {
    const d = deps();
    expect(
      await signUp(
        {
          inviteCode: "",
          firstName: "",
          lastName: "",
          email: "",
          password: "",
          timeZone: "",
        },
        d,
        OPEN,
      ),
    ).toEqual({
      kind: "invalid",
      fieldErrors: {
        inviteCode: "Enter the invite code.",
        firstName: "Enter your first name.",
        lastName: "Enter your last name.",
        email: "Enter your email.",
        password: "Enter a password.",
      },
    });
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
      { firstName: "Sam", lastName: "Ortiz", timeZone: "America/Chicago" },
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

  it("never logs the email, names, password, or code", async () => {
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
          throw new Error("sam@example.com");
        }),
      }),
      OPEN,
    );
    const logged = JSON.stringify(log.mock.calls);
    for (const secret of ["sam@example.com", "Sam", "barbell-315", CODE]) {
      expect(logged).not.toContain(secret);
    }
    log.mockRestore();
  });
});
