import { isPublicPath, routeRedirect } from "@/lib/auth-routes";
import { signInErrorMessage } from "@/app/login/credentials";
import {
  checkEmail,
  checkName,
  checkUsername,
  normalizeUsername,
  parseProfileInput,
  PROFILE_NAME_MAX,
  RESERVED_USERNAMES,
} from "@/lib/accounts/validation";

describe("proxy routing (Accounts spec §9)", () => {
  it.each(["/login", "/signup"])(
    "%s is reachable without an auth session",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
      expect(routeRedirect(path, false)).toBeNull();
    },
  );

  it.each([
    "/",
    "/settings",
    "/settings/delete-account",
    "/plan",
    "/loginx",
    // Password reset was removed (no email provider): these are not doors.
    "/forgot-password",
    "/reset-password",
    "/auth/confirm",
  ])("%s needs an auth session", (path) => {
    expect(routeRedirect(path, false)).toBe("/login");
  });

  it("sends a signed-in visitor away from login and signup only", () => {
    expect(routeRedirect("/login", true)).toBe("/");
    expect(routeRedirect("/signup", true)).toBe("/");
    expect(routeRedirect("/settings", true)).toBeNull();
  });
});

describe("signInErrorMessage", () => {
  it("never distinguishes an unknown email from a wrong password", () => {
    expect(
      signInErrorMessage({ code: "invalid_credentials", status: 400 }),
    ).toBe("Wrong email or password.");
    expect(signInErrorMessage({ status: 400 })).toBe(
      "Wrong email or password.",
    );
  });

  it("rate limit and anything else get their own plain messages", () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
    expect(signInErrorMessage({ code: "over_request_rate_limit" })).toMatch(
      /Too many attempts/,
    );
    expect(signInErrorMessage({ status: 500 })).toMatch(/Couldn't sign in/);
  });
});

describe("account form validation", () => {
  it("names are trimmed and 1–50 characters", () => {
    expect(checkName("firstName", "  Sam ")).toEqual({
      ok: true,
      value: "Sam",
    });
    expect(checkName("firstName", "   ")).toEqual({
      ok: false,
      message: "Enter your first name.",
    });
    expect(checkName("lastName", undefined)).toEqual({
      ok: false,
      message: "Enter your last name.",
    });
    expect(checkName("lastName", "x".repeat(PROFILE_NAME_MAX)).ok).toBe(true);
    expect(checkName("lastName", "x".repeat(PROFILE_NAME_MAX + 1))).toEqual({
      ok: false,
      message: "Use 50 characters or fewer.",
    });
  });

  it("emails are trimmed, lowercased, and shape-checked", () => {
    expect(checkEmail(" Sam@Example.COM ")).toEqual({
      ok: true,
      value: "sam@example.com",
    });
    expect(checkEmail("")).toEqual({ ok: false, message: "Enter your email." });
    expect(checkEmail("sam@example")).toEqual({
      ok: false,
      message: "Enter a valid email address.",
    });
  });

  it("a profile needs both names, a username, and a real IANA zone", () => {
    expect(
      parseProfileInput({
        firstName: " William ",
        lastName: "Rhodes",
        username: " @Will_R ",
        timeZone: "America/Chicago",
      }),
    ).toEqual({
      ok: true,
      value: {
        firstName: "William",
        lastName: "Rhodes",
        username: "will_r",
        timeZone: "America/Chicago",
      },
    });
    expect(
      parseProfileInput({
        firstName: "",
        lastName: "",
        username: "",
        timeZone: "Mars/Base",
      }),
    ).toEqual({
      ok: false,
      details: {
        firstName: "Enter your first name.",
        lastName: "Enter your last name.",
        username: "Choose a username.",
        timeZone: "Choose a timezone.",
      },
    });
  });
});

describe("usernames (OVE-50)", () => {
  const LENGTH = "Use 3 to 20 characters.";
  const CHARS = "Use only letters, numbers, and underscores.";

  it("are stored trimmed, without a leading @, and lowercase", () => {
    expect(normalizeUsername("  @Will_R ")).toBe("will_r");
    expect(normalizeUsername(undefined)).toBe("");
    expect(checkUsername("SAM")).toEqual({ ok: true, value: "sam" });
  });

  it("are 3–20 of a–z, 0–9, and _ (the database CHECK constraint's shape)", () => {
    expect(checkUsername("abc").ok).toBe(true);
    expect(checkUsername("a".repeat(20)).ok).toBe(true);
    expect(checkUsername("lifter_2026").ok).toBe(true);
    expect(checkUsername("")).toEqual({
      ok: false,
      message: "Choose a username.",
    });
    for (const [bad, message] of [
      ["ab", LENGTH],
      ["a".repeat(21), LENGTH],
      ["has space", CHARS],
      ["dash-ed", CHARS],
      ["dot.ted", CHARS],
      ["émile", CHARS],
      ["@@sam", CHARS],
      ["sam!", CHARS],
    ]) {
      expect([bad, checkUsername(bad)]).toEqual([bad, { ok: false, message }]);
    }
  });

  it("every accepted username matches the database constraint", () => {
    const DB_CHECK = /^[a-z0-9_]{3,20}$/;
    for (const raw of ["Sam", "@will", " lifter_2026 ", "ABC_123"]) {
      const result = checkUsername(raw);
      expect(result.ok && DB_CHECK.test(result.value)).toBe(true);
    }
  });

  it("reserved names are refused regardless of case", () => {
    expect(RESERVED_USERNAMES.has("admin")).toBe(true);
    for (const name of ["admin", "Overload", "@Support", "ROOT"]) {
      expect(checkUsername(name)).toEqual({
        ok: false,
        message: "That username isn't available.",
      });
    }
  });
});
