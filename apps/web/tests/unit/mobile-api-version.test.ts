/**
 * Pitch 21c (spec §8; RD-9–RD-11): app config and the version gate. Pure: env
 * maps are passed in, nothing is read from the process.
 */
import {
  checkAppVersion,
  compareAppVersions,
  minimumAppVersion,
  mobileAppConfig,
  mobileBotChallenge,
  mobileTourAutoStartEnabled,
  parseAppVersion,
} from "@/lib/api/mobile/version";
import { ApiFailure } from "@/lib/api/mobile/errors";

describe("parseAppVersion", () => {
  it.each([
    ["0.0.0", [0, 0, 0]],
    ["1.2.3", [1, 2, 3]],
    ["10.20.30", [10, 20, 30]],
    [" 2.0.1 ", [2, 0, 1]],
    ["999999.0.0", [999999, 0, 0]],
  ])("accepts %p", (raw, parts) => {
    expect(parseAppVersion(raw)).toEqual(parts);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["1"],
    ["1.2"],
    ["1.2.3.4"],
    ["v1.2.3"],
    ["1.2.3-beta"],
    ["1.2.3+5"],
    ["01.2.3"],
    ["1.-2.3"],
    ["1000000.0.0"],
    ["a.b.c"],
  ])("rejects %p", (raw) => {
    expect(parseAppVersion(raw as string | null | undefined)).toBeNull();
  });
});

describe("compareAppVersions", () => {
  it("orders numerically, not lexically", () => {
    expect(compareAppVersions([1, 10, 0], [1, 9, 9])).toBe(1);
    expect(compareAppVersions([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(compareAppVersions([0, 9, 9], [1, 0, 0])).toBe(-1);
  });
});

describe("mobileAppConfig", () => {
  const silence = () =>
    jest.spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => jest.restoreAllMocks());

  it("defaults: every version served, maintenance off, signup closed", () => {
    expect(mobileAppConfig({})).toEqual({
      minimumAppVersion: "0.0.0",
      latestAppVersion: "0.0.0",
      killSwitches: { planImportEnabled: false, maintenance: false },
      signupMode: "closed",
      // No bypass and no configured key: a challenge is required but unavailable.
      botChallenge: { provider: "turnstile", siteKey: null, origin: null },
      // Pitch 21j: no configured support address is null, never a placeholder.
      supportEmail: null,
      // Pitch 21k RD-15: the app never starts the tour by itself by default.
      tourAutoStart: false,
    });
  });

  it('tourAutoStart is on only for exactly "true" (Pitch 21k RD-15)', () => {
    expect(
      mobileAppConfig({ MOBILE_TOUR_AUTO_START: "true" }).tourAutoStart,
    ).toBe(true);
    for (const v of ["TRUE", "1", "yes", "", "false", " true"]) {
      expect(mobileAppConfig({ MOBILE_TOUR_AUTO_START: v }).tourAutoStart).toBe(
        false,
      );
    }
  });

  it("app-config and the me view read the gate through one function (21l RD-22)", () => {
    expect(mobileTourAutoStartEnabled({})).toBe(false);
    expect(mobileTourAutoStartEnabled({ MOBILE_TOUR_AUTO_START: "true" })).toBe(
      true,
    );
    for (const v of ["TRUE", "1", "yes", "", "false", " true"]) {
      expect(mobileTourAutoStartEnabled({ MOBILE_TOUR_AUTO_START: v })).toBe(
        false,
      );
    }
  });

  it("reads the configured versions and raises latest to the minimum", () => {
    expect(
      mobileAppConfig({
        MOBILE_MIN_APP_VERSION: "1.4.0",
        MOBILE_LATEST_APP_VERSION: "1.6.2",
      }),
    ).toMatchObject({ minimumAppVersion: "1.4.0", latestAppVersion: "1.6.2" });
    expect(
      mobileAppConfig({
        MOBILE_MIN_APP_VERSION: "2.0.0",
        MOBILE_LATEST_APP_VERSION: "1.0.0",
      }),
    ).toMatchObject({ minimumAppVersion: "2.0.0", latestAppVersion: "2.0.0" });
  });

  it("an invalid value falls back to the default and logs only the variable name", () => {
    const spy = silence();
    const config = mobileAppConfig({ MOBILE_LATEST_APP_VERSION: "secret-ish" });
    expect(config.latestAppVersion).toBe("0.0.0");
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("MOBILE_LATEST_APP_VERSION");
    expect(logged).not.toContain("secret-ish");
  });

  it('maintenance is on only for exactly "true"', () => {
    expect(
      mobileAppConfig({ MOBILE_MAINTENANCE: "true" }).killSwitches.maintenance,
    ).toBe(true);
    for (const v of ["TRUE", "1", "yes", "", "false"]) {
      expect(
        mobileAppConfig({ MOBILE_MAINTENANCE: v }).killSwitches.maintenance,
      ).toBe(false);
    }
  });

  it("signup reads public only in public mode; invite reads closed", () => {
    expect(mobileAppConfig({ OVERLOAD_SIGNUP_MODE: "public" }).signupMode).toBe(
      "public",
    );
    expect(mobileAppConfig({ OVERLOAD_SIGNUP_MODE: "invite" }).signupMode).toBe(
      "closed",
    );
    expect(mobileAppConfig({ OVERLOAD_SIGNUP_MODE: "closed" }).signupMode).toBe(
      "closed",
    );
  });

  it("never carries the invite code or any other environment value", () => {
    const env = {
      OVERLOAD_SIGNUP_MODE: "invite",
      OVERLOAD_INVITE_CODE: "INVITE-CODE-XYZ",
      OVERLOAD_ADMIN_USER_IDS: "00000000-0000-4000-8000-00000000abcd",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-value",
      DATABASE_URL: "postgresql://user:pw@host/db",
      MOBILE_MIN_APP_VERSION: "1.0.0",
    };
    const json = JSON.stringify(mobileAppConfig(env));
    for (const value of Object.values(env).filter((v) => v !== "1.0.0")) {
      if (value === "invite") continue;
      expect(json).not.toContain(value);
    }
    expect(Object.keys(mobileAppConfig(env)).sort()).toEqual([
      "botChallenge",
      "killSwitches",
      "latestAppVersion",
      "minimumAppVersion",
      "signupMode",
      "supportEmail",
      "tourAutoStart",
    ]);
  });
});

describe("mobileBotChallenge (Pitch 21d RD-6)", () => {
  const production = {
    VERCEL_ENV: "production",
    NODE_ENV: "production",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAA-public-site-key",
    TURNSTILE_SECRET_KEY: "0x4AAAAAAA-secret-never-sent",
    NEXT_PUBLIC_APP_URL: "https://www.overloadtraining.app/some/path",
  };

  it("carries the public site key and the web origin, never the secret", () => {
    const challenge = mobileBotChallenge(production);
    expect(challenge).toEqual({
      provider: "turnstile",
      siteKey: "0x4AAAAAAA-public-site-key",
      origin: "https://www.overloadtraining.app",
    });
    expect(JSON.stringify(mobileAppConfig(production))).not.toContain(
      "secret-never-sent",
    );
  });

  it("is null exactly under the web's own Preview / development bypass", () => {
    expect(
      mobileBotChallenge({
        ...production,
        VERCEL_ENV: "preview",
        TURNSTILE_DISABLED: "true",
      }),
    ).toBeNull();
    // The flag never bypasses on Production.
    expect(
      mobileBotChallenge({ ...production, TURNSTILE_DISABLED: "true" }),
    ).not.toBeNull();
    // Without the flag, Preview still requires the challenge.
    expect(
      mobileBotChallenge({ ...production, VERCEL_ENV: "preview" }),
    ).not.toBeNull();
  });

  it("an unusable origin or key is null, so the app can't skip the check", () => {
    expect(
      mobileBotChallenge({
        ...production,
        NEXT_PUBLIC_APP_URL: "http://www.overloadtraining.app",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "  ",
      }),
    ).toEqual({ provider: "turnstile", siteKey: null, origin: null });
    expect(
      mobileBotChallenge({ ...production, NEXT_PUBLIC_APP_URL: "not a url" })
        ?.origin,
    ).toBeNull();
    expect(
      mobileBotChallenge({
        ...production,
        NEXT_PUBLIC_APP_URL: "http://localhost:3200",
      })?.origin,
    ).toBe("http://localhost:3200");
  });
});

describe("checkAppVersion", () => {
  const config = minimumAppVersion({ MOBILE_MIN_APP_VERSION: "1.2.0" });

  it("serves a version at or above the minimum", () => {
    expect(checkAppVersion("1.2.0", config)).toEqual([1, 2, 0]);
    expect(checkAppVersion("3.0.0", config)).toEqual([3, 0, 0]);
  });

  it("a version below the minimum is 426 upgrade_required", () => {
    const failure = checkAppVersion("1.1.9", config);
    expect(failure).toBeInstanceOf(ApiFailure);
    expect(failure).toMatchObject({ code: "upgrade_required", status: 426 });
  });

  it.each([[null], [""], ["latest"], ["1.2"]])(
    "a missing or malformed header %p is 400 validation_error naming the header",
    (header) => {
      const failure = checkAppVersion(header, config);
      expect(failure).toMatchObject({
        code: "validation_error",
        status: 400,
        details: { "X-Overload-App-Version": expect.any(String) },
      });
    },
  );
});
