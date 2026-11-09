/**
 * OVE-111 — structural guarantees for operator tooling. Any script that opens
 * a database connection must run a target-identity guard first and verify the
 * database identity marker; the retired host confirmation is gone everywhere;
 * and the development migration wrapper can only ever deploy or report status,
 * never reset, push, or reach Production.
 */
import fs from "node:fs";
import path from "node:path";
import {
  guardMigrationTarget,
  parseArgs as parseMigrateArgs,
} from "../../scripts/operator/migrate-dev/cli";
import { parseArgs as parseImportArgs } from "../../scripts/import/real-plan/cli";
import { TargetRefused } from "../../scripts/operator/target-identity";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PROD = "ycxvdiklpefyhdclxyau";
const DEV = "abcdefghijklmnopqrst";
const POOLER = "aws-0-us-east-1.pooler.supabase.com";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}
const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
/** Code only: comments may legitimately name what they forbid. */
const code = (f: string) =>
  fs
    .readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const operatorFiles = () => [
  ...walk(path.join(REPO_ROOT, "scripts")),
  path.join(REPO_ROOT, "prisma", "seed.ts"),
  ...walk(path.join(REPO_ROOT, "prisma", "seed")),
];

const CONNECTS =
  /new\s+PrismaClient\b|import\(\s*["']@\/lib\/db["']\s*\)|from\s+["']@\/lib\/db["']/;
const GUARDS =
  /\b(assertOperatorTarget|assertSafeEnvironment|assertImportTargetAllowed|guardMigrationTarget)\(/;

describe("every operator connection is identity-guarded", () => {
  const connecting = () =>
    operatorFiles().filter((f) => CONNECTS.test(code(f)));

  it("finds the operator entry points that connect", () => {
    expect(connecting().map(rel).sort()).toEqual(
      [
        "prisma/seed.ts",
        "scripts/demo/cli.ts",
        "scripts/import/real-plan/cli.ts",
        "scripts/operator/account-ownership/cli.ts",
        "scripts/operator/founding-members/cli.ts",
        "scripts/operator/migrate-dev/cli.ts",
      ].sort(),
    );
  });

  it.each(
    operatorFiles()
      .filter((f) => CONNECTS.test(code(f)))
      .map((f) => [rel(f), f]),
  )("%s runs a target guard and verifies the identity marker", (_name, f) => {
    const src = code(f);
    expect(src).toMatch(GUARDS);
    expect(src).toMatch(/verifyTargetMarker\(/);
    // The guard appears before the connection is built.
    expect(src.search(GUARDS)).toBeLessThan(src.search(CONNECTS));
  });

  it("no operator script accepts the retired host confirmation", () => {
    for (const f of operatorFiles()) {
      expect([rel(f), /\bconfirmHost\b/.test(code(f))]).toEqual([
        rel(f),
        false,
      ]);
    }
  });
});

describe("production policy per tool (no implicit production fallback)", () => {
  // Development-only tools refuse Production outright. Only tools whose
  // approved runbooks sanction a deliberate production run may use the
  // explicit opt-in, and its only source is a typed --production flag.
  const POLICY: Record<string, "refuse" | "explicit-opt-in"> = {
    "scripts/operator/migrate-dev/cli.ts": "refuse",
    "scripts/demo/guard.ts": "refuse",
    "prisma/seed/target-guard.ts": "explicit-opt-in",
    "scripts/import/real-plan/cli.ts": "explicit-opt-in",
    "scripts/operator/founding-members/cli.ts": "explicit-opt-in",
    "scripts/operator/account-ownership/cli.ts": "explicit-opt-in",
  };

  it.each(Object.entries(POLICY))("%s uses policy %s", (file, policy) => {
    const src = code(path.join(REPO_ROOT, file));
    expect(src).toContain(`production: "${policy}"`);
    if (policy === "explicit-opt-in") {
      // The opt-in comes from the parsed --production flag, never from env.
      expect(src).toContain('"--production"');
      expect(src).toMatch(/productionOptIn:\s*args\.production/);
    } else {
      expect(src).not.toMatch(/productionOptIn/);
    }
  });

  it("no other script may opt into production", () => {
    const optIn = operatorFiles()
      .filter((f) => /production:\s*"explicit-opt-in"/.test(code(f)))
      .map(rel)
      .sort();
    expect(optIn).toEqual(
      Object.entries(POLICY)
        .filter(([, p]) => p === "explicit-opt-in")
        .map(([f]) => f)
        .sort(),
    );
  });
});

describe("the development migration wrapper", () => {
  const src = () =>
    code(path.join(REPO_ROOT, "scripts", "operator", "migrate-dev", "cli.ts"));
  const devEnv = {
    DATABASE_URL: `postgresql://postgres.${DEV}:pw@${POOLER}:6543/postgres`,
    DIRECT_URL: `postgresql://postgres.${DEV}:pw@${POOLER}:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co`,
  };
  const prodEnv = {
    DATABASE_URL: `postgresql://postgres.${PROD}:pw@${POOLER}:6543/postgres`,
    DIRECT_URL: `postgresql://postgres.${PROD}:pw@${POOLER}:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
  };

  it("only ever runs `prisma migrate deploy` or `prisma migrate status`", () => {
    const s = src();
    expect(s).toMatch(/args\.execute \? "deploy" : "status"/);
    expect(s).not.toMatch(
      /["'](reset|push|dev|resolve)["']|--force|accept-data-loss|db execute/,
    );
  });

  it("never loads .env (the guard sees only what the operator exported)", () => {
    expect(src()).not.toMatch(/dotenv/);
  });

  it("refuses Production even with --confirm-ref and --execute (no override exists)", () => {
    expect(() =>
      guardMigrationTarget(
        prodEnv,
        parseMigrateArgs(["--confirm-ref", PROD, "--execute"]),
      ),
    ).toThrow(/PRODUCTION/);
    expect(parseMigrateArgs(["--production"]).unexpected).toEqual([
      "--production",
    ]);
    expect(() =>
      guardMigrationTarget(
        devEnv,
        parseMigrateArgs(["--confirm-ref", DEV, "--production"]),
      ),
    ).toThrow(/Unexpected/);
  });

  it("refuses the development project without explicit confirmation", () => {
    expect(() => guardMigrationTarget(devEnv, parseMigrateArgs([]))).toThrow(
      /--confirm-ref/,
    );
    expect(() =>
      guardMigrationTarget(
        devEnv,
        parseMigrateArgs(["--confirm-host", POOLER]),
      ),
    ).toThrow(/no longer accepted/);
  });

  it("requires all three variables, naming the same project", () => {
    const { DIRECT_URL: _omit, ...partial } = devEnv;
    void _omit;
    expect(() =>
      guardMigrationTarget(partial, parseMigrateArgs(["--confirm-ref", DEV])),
    ).toThrow(/DIRECT_URL is not set/);
    expect(() =>
      guardMigrationTarget(
        { ...devEnv, DIRECT_URL: prodEnv.DIRECT_URL },
        parseMigrateArgs(["--confirm-ref", DEV]),
      ),
    ).toThrow(TargetRefused);
  });

  it("accepts the confirmed development project", () => {
    expect(
      guardMigrationTarget(
        devEnv,
        parseMigrateArgs(["--confirm-ref", DEV, "--execute"]),
      ),
    ).toEqual({ kind: "hosted", ref: DEV, host: POOLER, production: false });
  });
});

describe("real-plan import arguments", () => {
  it("parses the account, confirmation, and production flags", () => {
    expect(
      parseImportArgs([
        "--account-email",
        "a@b.c",
        "--confirm-ref",
        DEV,
        "--apply",
      ]),
    ).toEqual({
      accountEmail: "a@b.c",
      confirmRef: DEV,
      apply: true,
      production: false,
      unexpected: [],
    });
    expect(parseImportArgs(["--confirm-host", "h"]).unexpected).toContain(
      "--confirm-host",
    );
  });
});
