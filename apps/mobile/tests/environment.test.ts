/**
 * Pitch 21d spec §7 (RD-15): every artifact is staging-only. The allowlist
 * is enforced by app.config.ts, at launch, and here, against the committed
 * eas.json and every committed file under apps/mobile.
 */
import fs from "node:fs";
import path from "node:path";
import {
  anonKeyProjectRef,
  checkEasTarget,
  checkMobileEnvironment,
  PRODUCTION_MARKERS,
  STAGING_API_ORIGIN,
  STAGING_SUPABASE_REF,
} from "@overload/shared/mobile/environment";

const ROOT = path.resolve(__dirname, "..");
const jwt = (payload: object) =>
  [
    "e30",
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "sig",
  ].join(".");
const DEV_KEY = jwt({ ref: STAGING_SUPABASE_REF, role: "anon" });

describe("checkMobileEnvironment", () => {
  it("accepts staging with the overload-dev anon key", () => {
    const r = checkMobileEnvironment({
      environment: "staging",
      supabaseAnonKey: DEV_KEY,
      allowLocalApi: false,
    });
    expect(r).toEqual({
      ok: true,
      config: {
        environment: "staging",
        apiOrigin: STAGING_API_ORIGIN,
        localApi: false,
        supabaseUrl: `https://${STAGING_SUPABASE_REF}.supabase.co`,
        supabaseRef: STAGING_SUPABASE_REF,
        supabaseAnonKey: DEV_KEY,
      },
    });
  });

  it("refuses production, unknown environments, and missing keys, naming only variables", () => {
    const prodKey = jwt({ ref: "ycxvdiklpefyhdclxyau", role: "anon" });
    for (const input of [
      { environment: "production", supabaseAnonKey: DEV_KEY },
      { environment: undefined, supabaseAnonKey: DEV_KEY },
      { environment: "staging", supabaseAnonKey: "" },
      { environment: "staging", supabaseAnonKey: prodKey },
      {
        environment: "staging",
        supabaseAnonKey: jwt({ ref: "someotherproject" }),
      },
    ]) {
      const r = checkMobileEnvironment({ ...input, allowLocalApi: false });
      expect(r.ok).toBe(false);
      const text = r.ok ? "" : r.problems.join("\n");
      expect(text).toMatch(/EXPO_PUBLIC_/);
      expect(text).not.toContain(prodKey);
      expect(text).not.toContain(DEV_KEY);
    }
  });

  it("allows a local API only in a development bundle, and only a private origin", () => {
    const base = { environment: "staging", supabaseAnonKey: DEV_KEY };
    const dev = checkMobileEnvironment({
      ...base,
      localApiOrigin: "http://192.168.1.20:3200",
      allowLocalApi: true,
    });
    expect(dev.ok && dev.config).toMatchObject({
      apiOrigin: "http://192.168.1.20:3200",
      localApi: true,
    });
    // A release bundle or an update ignores the override entirely.
    const release = checkMobileEnvironment({
      ...base,
      localApiOrigin: "http://localhost:3200",
      allowLocalApi: false,
    });
    expect(release.ok && release.config.apiOrigin).toBe(STAGING_API_ORIGIN);
    for (const bad of [
      "https://www.overloadtraining.app",
      "http://example.com",
      "http://localhost:3200/api",
    ]) {
      expect(
        checkMobileEnvironment({
          ...base,
          localApiOrigin: bad,
          allowLocalApi: true,
        }).ok,
      ).toBe(false);
    }
  });

  it("reads the project ref from a legacy anon key", () => {
    expect(anonKeyProjectRef(DEV_KEY)).toBe(STAGING_SUPABASE_REF);
    expect(anonKeyProjectRef("sb_publishable_abc")).toBeNull();
  });
});

describe("EAS profiles and channels", () => {
  it("refuses any profile or channel outside the allowlist", () => {
    expect(
      checkEasTarget({ profile: "development", channel: "staging" }),
    ).toEqual([]);
    expect(checkEasTarget({ profile: undefined, channel: undefined })).toEqual(
      [],
    );
    expect(
      checkEasTarget({ profile: "production", channel: undefined }),
    ).toHaveLength(1);
    expect(
      checkEasTarget({ profile: undefined, channel: "production" }),
    ).toHaveLength(1);
  });

  it("eas.json: the development profiles stay on staging; one production profile on its own channel (21l)", () => {
    const eas = JSON.parse(
      fs.readFileSync(path.join(ROOT, "eas.json"), "utf8"),
    );
    expect(Object.keys(eas.build).sort()).toEqual([
      "development",
      "development-simulator",
      "production",
    ]);
    expect(eas.build.development.channel).toBe("staging");
    expect(eas.build.development.environment).toBe("development");
    expect(eas.build.development.env).toEqual({
      EXPO_PUBLIC_OVERLOAD_ENV: "staging",
    });
    expect(eas.build.development.developmentClient).toBe(true);
    expect(eas.build.development.distribution).toBe("internal");
    expect(JSON.stringify(eas.build.development)).not.toMatch(/production/i);
    expect(eas.build["development-simulator"].extends).toBe("development");

    const prod = eas.build.production;
    expect(prod.channel).toBe("production");
    expect(prod.environment).toBe("production");
    expect(prod.env).toEqual({ EXPO_PUBLIC_OVERLOAD_ENV: "production" });
    expect(prod.distribution).toBe("store");
    expect(prod.developmentClient).toBeUndefined();
    expect(prod.extends).toBeUndefined();
    expect(prod.autoIncrement).toBe(true);
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(JSON.stringify(prod)).not.toMatch(/staging|development/i);
    expect(Object.keys(eas.submit ?? {})).toEqual(["production"]);
  });
});

describe("no committed mobile file names Production", () => {
  const SKIP = new Set([
    "node_modules",
    "ios",
    "android",
    ".expo",
    "dist",
    "tests",
  ]);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name) || e.name === ".env.local") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|json|md)$|^\.env/.test(e.name))
        files.push(full);
    }
  };
  walk(ROOT);

  it("finds the app's files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(PRODUCTION_MARKERS)("%s appears nowhere", (marker) => {
    const offenders = files.filter((f) =>
      fs.readFileSync(f, "utf8").toLowerCase().includes(marker),
    );
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe("app.config.ts refuses a bad environment before anything is bundled", () => {
  const load = (env: Record<string, string | undefined>) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env))
      if (v === undefined) delete process.env[k];
    try {
      let config: unknown;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require("../app.config");
        config = (mod.default ?? mod)({ config: {} });
      });
      return config as { name: string; ios: { bundleIdentifier: string } };
    } finally {
      process.env = saved;
    }
  };
  const good = {
    EXPO_PUBLIC_OVERLOAD_ENV: "staging",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: DEV_KEY,
  };

  it("builds the staging config", () => {
    const c = load(good);
    expect(c.ios.bundleIdentifier).toBe("app.overloadtraining.dev");
  });

  it("an absent value passes the config step (eas-cli's pre-check); the app's launch check catches it", () => {
    const c = load({
      EXPO_PUBLIC_OVERLOAD_ENV: undefined,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    expect(c.ios.bundleIdentifier).toBe("app.overloadtraining.dev");
  });

  it.each([
    [{ EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt({ ref: "ycxvdiklpefyhdclxyau" }) }],
    [{ EXPO_PUBLIC_EXTRA: "https://www.overloadtraining.app" }],
  ])("a staging target refuses %j", (bad) => {
    expect(() => load({ ...good, ...bad })).toThrow(/staging only/);
  });

  // Pitch 21l: any Production signal is checked by the Production rules, so a
  // half-set target is refused, never treated as staging.
  it.each([
    [{ EAS_BUILD_PROFILE: "production" }],
    [{ EAS_UPDATE_CHANNEL: "production" }],
    [{ EXPO_PUBLIC_OVERLOAD_ENV: "production" }],
  ])("a Production signal with staging values is refused: %j", (signal) => {
    expect(() => load({ ...good, ...signal })).toThrow(/\(Production\)/);
  });
});
