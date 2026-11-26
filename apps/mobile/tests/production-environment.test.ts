/**
 * Pitch 21l (spec §3, §11): the Production half of the environment fence,
 * the runtime resolver, the Production app config, and the Production-only
 * behaviors of the gate and About this app. Each environment refuses the
 * other's values.
 */
import fs from "node:fs";
import path from "node:path";
import {
  STAGING_API_ORIGIN,
  STAGING_SUPABASE_REF,
} from "@overload/shared/mobile/environment";
import {
  checkProductionEasTarget,
  checkProductionEnvironment,
  isProductionTarget,
  mentionsStaging,
  PRODUCTION_API_ORIGIN,
  PRODUCTION_SUPABASE_REF,
  PRODUCTION_SUPABASE_URL,
  STAGING_MARKERS,
} from "@overload/shared/mobile/production-environment";
import {
  environmentLabel,
  resolveMobileEnvironment,
} from "@overload/shared/mobile/app-environment";
import { ApiError } from "../src/api/errors";
import { decideGate } from "../src/app-state/gate";
import {
  describeBuildIdentity,
  footerLine,
} from "../src/diagnostics/build-identity";
import { appConfig } from "./harness";

const jwt = (payload: object) =>
  [
    "e30",
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "sig",
  ].join(".");
const PROD_KEY = jwt({ ref: PRODUCTION_SUPABASE_REF, role: "anon" });
const DEV_KEY = jwt({ ref: STAGING_SUPABASE_REF, role: "anon" });

describe("the Production constants", () => {
  it("are the canonical Production origin and project", () => {
    // The apex redirects to www; the client refuses a cross-origin redirect.
    expect(PRODUCTION_API_ORIGIN).toBe("https://www.overloadtraining.app");
    expect(PRODUCTION_SUPABASE_URL).toBe(
      "https://ycxvdiklpefyhdclxyau.supabase.co",
    );
  });

  it("the staging markers name environment.ts's staging values (pinned, since the module can't import it)", () => {
    expect(STAGING_MARKERS).toContain(STAGING_SUPABASE_REF);
    expect(mentionsStaging(STAGING_API_ORIGIN)).toBe(true);
    expect(mentionsStaging(PRODUCTION_API_ORIGIN)).toBe(false);
    expect(mentionsStaging(PROD_KEY)).toBe(false);
  });

  it("production-environment.ts imports nothing (Node loads it from app.config.ts)", () => {
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../packages/shared/src/mobile/production-environment.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/require\(/);
  });
});

describe("checkProductionEnvironment", () => {
  const good = { environment: "production", supabaseAnonKey: PROD_KEY };

  it("accepts Production values and always uses the Production origin", () => {
    const r = checkProductionEnvironment(good);
    expect(r).toEqual({
      ok: true,
      config: {
        environment: "production",
        apiOrigin: PRODUCTION_API_ORIGIN,
        localApi: false,
        supabaseUrl: PRODUCTION_SUPABASE_URL,
        supabaseRef: PRODUCTION_SUPABASE_REF,
        supabaseAnonKey: PROD_KEY,
      },
    });
  });

  it.each([
    [
      "the staging anon key",
      { supabaseAnonKey: DEV_KEY },
      /other than Production/,
    ],
    [
      "a key naming staging",
      { supabaseAnonKey: `x${STAGING_SUPABASE_REF}` },
      /names staging/,
    ],
    ["no key", { supabaseAnonKey: undefined }, /missing/],
    [
      "the staging environment",
      { environment: "staging" },
      /must be production/,
    ],
    [
      "a local API, even in development",
      { localApiOrigin: "http://localhost:3000" },
      /must not be set/,
    ],
  ])("refuses %s", (_label, over, problem) => {
    const r = checkProductionEnvironment({ ...good, ...over });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.join("\n")).toMatch(problem);
      // Problems name variables, never values.
      expect(r.problems.join("\n")).not.toContain(DEV_KEY);
    }
  });

  it("accepts a publishable (non-JWT) key it cannot read a project from", () => {
    expect(
      checkProductionEnvironment({
        ...good,
        supabaseAnonKey: "sb_publishable_x",
      }).ok,
    ).toBe(true);
  });
});

describe("EAS targets", () => {
  it("any Production signal makes a Production target", () => {
    const none = {
      environment: undefined,
      profile: undefined,
      channel: undefined,
    };
    expect(isProductionTarget(none)).toBe(false);
    expect(
      isProductionTarget({
        ...none,
        environment: "staging",
        profile: "development",
        channel: "staging",
      }),
    ).toBe(false);
    expect(isProductionTarget({ ...none, environment: "production" })).toBe(
      true,
    );
    expect(isProductionTarget({ ...none, profile: "production" })).toBe(true);
    expect(isProductionTarget({ ...none, channel: "production" })).toBe(true);
  });

  it("a Production target must say Production everywhere it says anything", () => {
    expect(
      checkProductionEasTarget({
        environment: "production",
        profile: "production",
        channel: "production",
      }),
    ).toEqual([]);
    expect(
      checkProductionEasTarget({
        environment: "production",
        profile: undefined,
        channel: undefined,
      }),
    ).toEqual([]);
    expect(
      checkProductionEasTarget({
        environment: "staging",
        profile: "production",
        channel: undefined,
      }),
    ).toHaveLength(1);
    expect(
      checkProductionEasTarget({
        environment: "production",
        profile: "development",
        channel: undefined,
      }),
    ).toHaveLength(1);
    expect(
      checkProductionEasTarget({
        environment: "production",
        profile: undefined,
        channel: "staging",
      }),
    ).toHaveLength(1);
  });
});

describe("resolveMobileEnvironment (the app's launch check)", () => {
  it("production goes to the Production rules", () => {
    const r = resolveMobileEnvironment({
      environment: "production",
      supabaseAnonKey: PROD_KEY,
      allowLocalApi: true,
    });
    expect(r.ok && r.config.apiOrigin).toBe(PRODUCTION_API_ORIGIN);
    expect(environmentLabel(r)).toBe("Production");
  });

  it("a Production build carrying the staging key is misconfigured", () => {
    const r = resolveMobileEnvironment({
      environment: "production",
      supabaseAnonKey: DEV_KEY,
      allowLocalApi: false,
    });
    expect(r.ok).toBe(false);
    expect(environmentLabel(r)).toBe("Misconfigured");
  });

  it("staging is unchanged, and still refuses the Production key", () => {
    const s = resolveMobileEnvironment({
      environment: "staging",
      supabaseAnonKey: DEV_KEY,
      allowLocalApi: false,
    });
    expect(s.ok && s.config.apiOrigin).toBe(STAGING_API_ORIGIN);
    expect(environmentLabel(s)).toBe("Staging");
    expect(
      resolveMobileEnvironment({
        environment: "staging",
        supabaseAnonKey: PROD_KEY,
        allowLocalApi: false,
      }).ok,
    ).toBe(false);
  });
});

describe("app.config.ts for a Production target", () => {
  type Config = {
    name: string;
    scheme: string;
    version: string;
    ios: {
      bundleIdentifier: string;
      infoPlist?: unknown;
      config?: unknown;
      supportsTablet?: boolean;
    };
    plugins: (string | [string, unknown])[];
    updates?: { url: string };
    runtimeVersion?: unknown;
  };
  const load = (env: Record<string, string | undefined>): Config => {
    const saved = { ...process.env };
    for (const k of Object.keys(process.env))
      if (k.startsWith("EXPO_PUBLIC_") || k.startsWith("EAS_"))
        delete process.env[k];
    Object.assign(process.env, env);
    try {
      let config: unknown;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require("../app.config");
        config = (mod.default ?? mod)({ config: {} });
      });
      return config as Config;
    } finally {
      process.env = saved;
    }
  };
  const prod = {
    EXPO_PUBLIC_OVERLOAD_ENV: "production",
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: PROD_KEY,
  };

  it("is the TestFlight app's identity, with no dev launcher and no local-network exception", () => {
    const c = load(prod);
    expect(c.name).toBe("Overload");
    expect(c.scheme).toBe("overload");
    expect(c.version).toBe("1.0.0");
    expect(c.ios.bundleIdentifier).toBe("app.overloadtraining");
    expect(c.ios.supportsTablet).toBe(false);
    expect(c.ios.config).toEqual({ usesNonExemptEncryption: false });
    expect(c.ios.infoPlist).toBeUndefined();
    expect(c.runtimeVersion).toEqual({ policy: "fingerprint" });
    expect(c.updates?.url).toMatch(/^https:\/\/u\.expo\.dev\//);
    const names = c.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).not.toContain("expo-dev-client");
    expect(names).toEqual([
      "expo-router",
      "expo-secure-store",
      "expo-image-picker",
      "expo-splash-screen",
      "expo-font",
    ]);
  });

  it("a Production update (channel and environment, no profile) evaluates too", () => {
    expect(
      load({
        EXPO_PUBLIC_OVERLOAD_ENV: "production",
        EAS_UPDATE_CHANNEL: "production",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: PROD_KEY,
      }).ios.bundleIdentifier,
    ).toBe("app.overloadtraining");
  });

  it.each([
    [{ EXPO_PUBLIC_SUPABASE_ANON_KEY: DEV_KEY }],
    [{ EAS_UPDATE_CHANNEL: "staging" }],
    [{ EAS_BUILD_PROFILE: "development" }],
    [{ EXPO_PUBLIC_LOCAL_API_ORIGIN: "http://localhost:3000" }],
    [{ EXPO_PUBLIC_EXTRA: STAGING_API_ORIGIN }],
  ])("refuses %j", (bad) => {
    expect(() => load({ ...prod, ...bad })).toThrow(/\(Production\)/);
  });

  it("on the EAS builder a Production build without its key is refused (review #2)", () => {
    expect(() =>
      load({
        EXPO_PUBLIC_OVERLOAD_ENV: "production",
        EAS_BUILD_PROFILE: "production",
        EAS_BUILD: "true",
      }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY is missing/);
    // eas-cli's first local evaluation, before the environment is injected.
    expect(
      load({
        EXPO_PUBLIC_OVERLOAD_ENV: "production",
        EAS_BUILD_PROFILE: "production",
      }).ios.bundleIdentifier,
    ).toBe("app.overloadtraining");
  });

  it("app.config.ts's Production detection agrees with isProductionTarget", () => {
    const cases = [
      { environment: "production", profile: undefined, channel: undefined },
      { environment: undefined, profile: "production", channel: undefined },
      { environment: undefined, profile: undefined, channel: "production" },
      { environment: "staging", profile: "development", channel: "staging" },
      { environment: undefined, profile: undefined, channel: undefined },
    ];
    for (const t of cases) {
      const env = {
        EXPO_PUBLIC_OVERLOAD_ENV: t.environment,
        EAS_BUILD_PROFILE: t.profile,
        EAS_UPDATE_CHANNEL: t.channel,
      };
      let production: boolean;
      try {
        production = load(env).name === "Overload";
      } catch (e) {
        production = /\(Production\)/.test(String(e));
      }
      expect(production).toBe(isProductionTarget(t));
    }
  });

  it("the staging target still builds the development identity", () => {
    const c = load({
      EXPO_PUBLIC_OVERLOAD_ENV: "staging",
      EAS_BUILD_PROFILE: "development",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: DEV_KEY,
    });
    expect(c.name).toBe("Overload Dev");
    expect(c.version).toBe("0.1.0");
    expect(c.ios.bundleIdentifier).toBe("app.overloadtraining.dev");
    expect(c.plugins.map((p) => (Array.isArray(p) ? p[0] : p))).toContain(
      "expo-dev-client",
    );
  });
});

describe("Production never shows the staging access screen (RD-27)", () => {
  const base = {
    envOk: true,
    config: {
      status: "error" as const,
      error: new ApiError("staging_protected", "x", 401),
    },
    session: "present" as const,
    me: "idle" as const,
    appVersion: "1.0.0",
    upgradeRequiredSeen: false,
  };
  it("is unreachable in Production and the access gate on staging", () => {
    expect(decideGate({ ...base, stagingAccess: false })).toBe("unreachable");
    expect(decideGate({ ...base, stagingAccess: true })).toBe("staging_access");
    expect(decideGate(base)).toBe("staging_access");
  });
  it("a healthy Production launch is unaffected", () => {
    expect(
      decideGate({
        ...base,
        stagingAccess: false,
        session: "none",
        config: { status: "success", data: appConfig() },
      }),
    ).toBe("signed_out");
  });
});

describe("About this app and the More footer", () => {
  const prodEnv = resolveMobileEnvironment({
    environment: "production",
    supabaseAnonKey: PROD_KEY,
    allowLocalApi: false,
  });
  const stagingEnv = resolveMobileEnvironment({
    environment: "staging",
    supabaseAnonKey: DEV_KEY,
    allowLocalApi: false,
  });
  const embedded = {
    dev: false,
    isEmbeddedLaunch: true,
    updateId: null,
    manifest: null,
    channel: "production",
    createdAt: null,
    commit: null,
  };

  it("names Production, its server and project, the version, build, and channel", () => {
    const id = describeBuildIdentity({
      env: prodEnv,
      version: "1.0.0",
      buildNumber: "3",
      runtimeVersion: "e8a58a870acefc8cfee5",
      bundle: embedded,
    });
    expect(Object.fromEntries(id.build.map((r) => [r.title, r.value]))).toEqual(
      {
        Environment: "Production",
        Server: "www.overloadtraining.app",
        "Sign-in project": PRODUCTION_SUPABASE_REF,
        Version: "1.0.0",
        Build: "3",
      },
    );
    expect(
      Object.fromEntries(id.updates.map((r) => [r.title, r.value])),
    ).toMatchObject({
      Running: "Embedded bundle",
      Channel: "production",
      Runtime: "e8a58a870a",
    });
  });

  it("shows a running update's group on staging", () => {
    const id = describeBuildIdentity({
      env: stagingEnv,
      version: "0.1.0",
      buildNumber: "1",
      runtimeVersion: "2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c",
      bundle: {
        ...embedded,
        isEmbeddedLaunch: false,
        updateId: "01a215e7-4dbe-756c-b28f-45b2299097f3",
        manifest: {
          metadata: { updateGroup: "ad04a02b-95e3-4203-90d3-c8df40c2ebc3" },
        },
        channel: "staging",
        createdAt: new Date("2026-11-25T12:00:00Z"),
      },
    });
    const rows = Object.fromEntries(
      [...id.build, ...id.updates].map((r) => [r.title, r.value]),
    );
    expect(rows).toMatchObject({
      Environment: "Staging",
      Server: STAGING_API_ORIGIN.replace("https://", ""),
      "Update group": "ad04a02b",
      Channel: "staging",
      Runtime: "2e4a65d9cd",
    });
  });

  it("holds no key or token in any row", () => {
    const id = describeBuildIdentity({
      env: prodEnv,
      version: "1.0.0",
      buildNumber: null,
      runtimeVersion: null,
      bundle: embedded,
    });
    const text = JSON.stringify(id);
    expect(text).not.toContain(PROD_KEY);
    expect(text).not.toMatch(/eyJ|sb_publishable|token|password/i);
    expect(id.build.find((r) => r.title === "Build")?.value).toBe("—");
  });

  it("the footer says the version and build in Production, and Staging otherwise", () => {
    expect(
      footerLine({ env: prodEnv, version: "1.0.0", buildNumber: "3" }),
    ).toBe("Overload 1.0.0 (3)");
    expect(
      footerLine({ env: prodEnv, version: "1.0.0", buildNumber: null }),
    ).toBe("Overload 1.0.0");
    expect(
      footerLine({ env: stagingEnv, version: "0.1.0", buildNumber: "1" }),
    ).toBe("Overload 0.1.0 · Staging");
  });
});
