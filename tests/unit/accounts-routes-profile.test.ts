import { isPublicPath, routeRedirect } from "@/lib/auth-routes";
import { signInErrorMessage } from "@/app/login/credentials";
import {
  checkEmail,
  checkName,
  parseProfileInput,
  PROFILE_NAME_MAX,
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

  it("a profile needs both names and a real IANA zone", () => {
    expect(
      parseProfileInput({
        firstName: " William ",
        lastName: "Rhodes",
        timeZone: "America/Chicago",
      }),
    ).toEqual({
      ok: true,
      value: {
        firstName: "William",
        lastName: "Rhodes",
        timeZone: "America/Chicago",
      },
    });
    expect(
      parseProfileInput({ firstName: "", lastName: "", timeZone: "Mars/Base" }),
    ).toEqual({
      ok: false,
      details: {
        firstName: "Enter your first name.",
        lastName: "Enter your last name.",
        timeZone: "Choose a timezone.",
      },
    });
  });
});
