/**
 * Public Landing Page & Changelog — L5 (OVE-100; spec §13, RD-16/RD-17;
 * pitch Appendix A "Implementation/acceptance checks"). The demo seed's
 * production hard-refusal, argument rules, and static invariants: it never
 * loads .env, never writes a LoggedSet outside logSet, and has no delete path.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DemoSeedRefused,
  GUARDED_ENV_VARS,
  PRODUCTION_PROJECT_REFS,
  assertSafeEnvironment,
  maskEmail,
} from "../../scripts/demo/guard";
import { argsProblem, parseArgs } from "../../scripts/demo/cli";
import {
  DEMO_BLOCKS,
  DEMO_PERFORMANCES,
  DEMO_SESSIONS,
  demoWorkouts,
  expectedCounts,
} from "../../scripts/demo/fixture";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PROD_REF = "ycxvdiklpefyhdclxyau";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEMO_DIR = path.join(REPO_ROOT, "scripts", "demo");
const demoFiles = () =>
  fs
    .readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, fs.readFileSync(path.join(DEMO_DIR, f), "utf8")] as const);

describe("production hard refusal (RD-16)", () => {
  it("knows the production project ref", () => {
    expect(PRODUCTION_PROJECT_REFS).toContain(PROD_REF);
  });

  it.each(GUARDED_ENV_VARS.map((v) => [v]))(
    "refuses when %s names the production project, even with a local DATABASE_URL",
    (name) => {
      const env: Record<string, string> = { DATABASE_URL: LOCAL };
      env[name] =
        name === "DATABASE_URL"
          ? `postgresql://postgres.${PROD_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
          : `https://${PROD_REF}.supabase.co`;
      expect(() => assertSafeEnvironment(env)).toThrow(DemoSeedRefused);
    },
  );

  it.each([
    [
      "direct host",
      `postgresql://postgres:pw@db.${PROD_REF}.supabase.co:5432/postgres`,
    ],
    [
      "pooler user",
      `postgresql://postgres.${PROD_REF}:pw@127.0.0.1:6543/postgres`,
    ],
    [
      "upper-case ref",
      `postgresql://postgres:pw@db.${PROD_REF.toUpperCase()}.supabase.co/postgres`,
    ],
  ])("refuses the production ref in any form (%s)", (_why, url) => {
    expect(() => assertSafeEnvironment({ DATABASE_URL: url })).toThrow(
      DemoSeedRefused,
    );
  });

  it.each([
    [
      "any hosted Supabase project",
      "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres",
    ],
    [
      "a hosted pooler",
      "postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    ],
    ["a remote Postgres", "postgresql://user:pw@10.0.0.5:5432/postgres"],
    ["a public host", "postgresql://user:pw@db.example.com:5432/postgres"],
    ["an unparseable URL", "not a url"],
  ])("refuses %s", (_why, url) => {
    expect(() => assertSafeEnvironment({ DATABASE_URL: url })).toThrow(
      DemoSeedRefused,
    );
  });

  it("refuses when DATABASE_URL is missing (it never falls back to .env)", () => {
    expect(() => assertSafeEnvironment({})).toThrow(/never read/);
  });

  it.each([
    LOCAL,
    "postgresql://postgres:postgres@localhost:54322/postgres",
    "postgresql://postgres:postgres@[::1]:54322/postgres",
  ])("accepts a loopback database: %s", (url) => {
    expect(assertSafeEnvironment({ DATABASE_URL: url }).databaseUrl).toBe(url);
  });

  it("never echoes a credential in a refusal", () => {
    try {
      assertSafeEnvironment({
        DATABASE_URL: "postgresql://user:s3cret-pw@db.example.com:5432/x",
      });
    } catch (e) {
      expect((e as Error).message).not.toContain("s3cret-pw");
    }
  });
});

describe("one explicitly confirmed development project (OVE-111)", () => {
  const DEV = "abcdefghijklmnopqrst";
  const POOLER = "aws-0-us-east-1.pooler.supabase.com";
  const devEnv = (extra: Record<string, string> = {}) => ({
    DATABASE_URL: `postgresql://postgres.${DEV}:pw@${POOLER}:6543/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co`,
    ...extra,
  });

  it("still refuses a hosted project when no --confirm-ref is given", () => {
    expect(() => assertSafeEnvironment(devEnv())).toThrow(DemoSeedRefused);
  });

  it("accepts exactly the confirmed development project", () => {
    const out = assertSafeEnvironment(devEnv(), { confirmRef: DEV });
    expect(out.target).toEqual({
      kind: "hosted",
      ref: DEV,
      host: POOLER,
      production: false,
    });
  });

  it("refuses a confirmation that names the shared pooler host or another ref", () => {
    for (const confirmRef of [POOLER, "zyxwvutsrqponmlkjihg"]) {
      expect(() => assertSafeEnvironment(devEnv(), { confirmRef })).toThrow(
        DemoSeedRefused,
      );
    }
  });

  it("never reaches Production, even when the production ref is confirmed", () => {
    const prodEnv = {
      DATABASE_URL: `postgresql://postgres.${PROD_REF}:pw@${POOLER}:6543/postgres`,
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    };
    expect(() =>
      assertSafeEnvironment(prodEnv, { confirmRef: PROD_REF }),
    ).toThrow(/PRODUCTION/);
  });

  it("refuses a database and Supabase URL from different projects", () => {
    expect(() =>
      assertSafeEnvironment(
        devEnv({
          NEXT_PUBLIC_SUPABASE_URL: "https://zyxwvutsrqponmlkjihg.supabase.co",
        }),
        { confirmRef: DEV },
      ),
    ).toThrow(/different projects/);
  });

  it("requires NEXT_PUBLIC_SUPABASE_URL to cross-check a hosted target", () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _omit, ...env } = devEnv();
    void _omit;
    expect(() => assertSafeEnvironment(env, { confirmRef: DEV })).toThrow(
      DemoSeedRefused,
    );
  });

  it("refuses --confirm-ref against the local stack", () => {
    expect(() =>
      assertSafeEnvironment(
        {
          DATABASE_URL: LOCAL,
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        },
        { confirmRef: DEV },
      ),
    ).toThrow(DemoSeedRefused);
  });

  it("reads --confirm-ref from the arguments", () => {
    const ID = "b0000000-0000-4000-8000-000000000002";
    const args = parseArgs(["--user-id", ID, "--confirm-ref", DEV]);
    expect(args.confirmRef).toBe(DEV);
    expect(argsProblem(args)).toBeNull();
  });
});

describe("arguments: explicit target, dry run by default", () => {
  const ID = "b0000000-0000-4000-8000-000000000002";

  it("defaults to a dry run", () => {
    const args = parseArgs(["--user-id", ID]);
    expect(args.execute).toBe(false);
    expect(argsProblem(args)).toBeNull();
  });

  it("requires an explicit account id", () => {
    expect(argsProblem(parseArgs([]))).toMatch(/--user-id/);
    expect(argsProblem(parseArgs(["--user-id", "demo@example.test"]))).toMatch(
      /--user-id/,
    );
  });

  it("execute requires --confirm-user equal to --user-id (wrong account aborts)", () => {
    expect(argsProblem(parseArgs(["--user-id", ID, "--execute"]))).toMatch(
      /confirm-user/,
    );
    expect(
      argsProblem(
        parseArgs([
          "--user-id",
          ID,
          "--execute",
          "--confirm-user",
          "b0000000-0000-4000-8000-000000000003",
        ]),
      ),
    ).toMatch(/confirm-user/);
    expect(
      argsProblem(
        parseArgs(["--user-id", ID, "--execute", "--confirm-user", ID]),
      ),
    ).toBeNull();
  });

  it("has no production, force, or override flag", () => {
    for (const flag of [
      "--production",
      "--force",
      "--allow-remote",
      "--confirm-host",
    ]) {
      expect(argsProblem(parseArgs(["--user-id", ID, flag]))).toMatch(
        /Unexpected/,
      );
    }
  });

  it("masks emails", () => {
    expect(maskEmail("demo@example.test")).toBe("d***@example.test");
  });
});

describe("static invariants of scripts/demo (RD-17)", () => {
  it("never writes a LoggedSet directly (only through logSet)", () => {
    for (const [file, src] of demoFiles()) {
      expect([
        file,
        /\.\s*loggedSet\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(
          src,
        ),
      ]).toEqual([file, false]);
    }
  });

  it("has no delete, reset, raw write, or .env loading anywhere", () => {
    for (const [file, src] of demoFiles()) {
      expect([file, /\.\s*(delete|deleteMany)\s*\(/.test(src)]).toEqual([
        file,
        false,
      ]);
      expect([file, /\$executeRaw|TRUNCATE|DROP\s/i.test(src)]).toEqual([
        file,
        false,
      ]);
      expect([file, /dotenv/.test(src)]).toEqual([file, false]);
      expect([file, /migrate reset|db push/.test(src)]).toEqual([file, false]);
    }
  });

  it("the CLI runs the guard before loading any database module", () => {
    const cli = fs.readFileSync(path.join(DEMO_DIR, "cli.ts"), "utf8");
    const staticImports = [
      ...cli.matchAll(/^import[^;]*from\s+["']([^"']+)["']/gm),
    ].map((m) => m[1]);
    expect(staticImports).toEqual(["./guard"]);
    const guardAt = cli.indexOf("assertSafeEnvironment(process.env");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(cli.indexOf('import("@prisma/client")'));
  });

  it("the CLI verifies the database identity marker before reading anything", () => {
    const cli = fs.readFileSync(path.join(DEMO_DIR, "cli.ts"), "utf8");
    const markerAt = cli.indexOf("verifyTargetMarker(target");
    expect(markerAt).toBeGreaterThan(-1);
    expect(markerAt).toBeLessThan(cli.indexOf("FROM auth.users"));
  });

  it("writes history only through the app's write modules", () => {
    const seed = fs.readFileSync(path.join(DEMO_DIR, "seed.ts"), "utf8");
    for (const fn of [
      "createGym(",
      "createMesocycle(",
      "addSession(",
      "addSessionExercise(",
      "activateMesocycle(",
      "startOrResumeWorkout(",
      "logSet(",
      "completeWorkout(",
    ]) {
      expect(seed).toContain(fn);
    }
    expect(seed).not.toMatch(
      /tx\.(gym|mesocycle|session|loggedSession|loggedExercise)\.create/,
    );
  });
});

describe("fixture shape (deterministic, synthetic)", () => {
  it("is deterministic: the same workouts every time", () => {
    expect(demoWorkouts()).toEqual(demoWorkouts());
    expect(expectedCounts()).toEqual(expectedCounts());
  });

  it("has a performance for every trained week of every exercise, with one rep count per planned set", () => {
    const weeks = DEMO_BLOCKS.reduce((n, b) => n + b.weeksTrained, 0);
    for (const session of DEMO_SESSIONS) {
      for (const slot of session.slots) {
        const perfs = DEMO_PERFORMANCES[slot.ex];
        expect(perfs).toHaveLength(weeks);
        for (const [weight, reps] of perfs) {
          expect(weight).toBeGreaterThan(0);
          expect(reps).toHaveLength(slot.sets);
          for (const r of reps) expect(r).toBeGreaterThan(0);
        }
      }
    }
  });

  it("covers about eight weeks, all before the anchor", () => {
    const days = demoWorkouts().map((w) => w.daysBeforeAnchor);
    expect(Math.max(...days)).toBe(56);
    expect(Math.min(...days)).toBeGreaterThan(0);
  });

  it("names no real person or brand", () => {
    const src = fs.readFileSync(path.join(DEMO_DIR, "fixture.ts"), "utf8");
    expect(src).not.toMatch(/@(?!example\.test)[\w-]+\.[a-z]{2,}/i);
    expect(src).not.toMatch(
      /planet fitness|gold'?s gym|la fitness|equinox|24 hour/i,
    );
  });
});
