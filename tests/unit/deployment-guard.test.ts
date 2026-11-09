/**
 * OVE-111 — the Preview / Development tripwire. A non-production Vercel
 * deployment whose database or Supabase variables reference Production must
 * fail (at build, at server start, and before the Prisma client is built),
 * naming the variable but never its value.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEPLOYMENT_TARGET_VARS,
  DeploymentTargetRefused,
  assertDeploymentTarget,
  isNonProductionDeployment,
} from "@/lib/env/deployment-guard";

const PROD = "ycxvdiklpefyhdclxyau";
const DEV = "abcdefghijklmnopqrst";
const SECRET = "s3cret-P4ss";
const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const devEnv = (deployment: string) => ({
  VERCEL_ENV: deployment,
  DATABASE_URL: `postgresql://postgres.${DEV}:${SECRET}@${POOLER}:6543/postgres`,
  DIRECT_URL: `postgresql://postgres.${DEV}:${SECRET}@${POOLER}:5432/postgres`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co`,
});

const prodValueFor = (name: string) =>
  name === "NEXT_PUBLIC_SUPABASE_URL" || name === "SUPABASE_URL"
    ? `https://${PROD}.supabase.co`
    : `postgresql://postgres.${PROD}:${SECRET}@${POOLER}:6543/postgres`;

describe("Preview accidentally referencing Production", () => {
  it.each(DEPLOYMENT_TARGET_VARS.map((v) => [v]))(
    "refuses a Preview where %s points at Production",
    (name) => {
      const env = { ...devEnv("preview"), [name]: prodValueFor(name) };
      expect(() => assertDeploymentTarget(env)).toThrow(
        DeploymentTargetRefused,
      );
      expect(() => assertDeploymentTarget(env)).toThrow(new RegExp(name));
    },
  );

  it("refuses the production DIRECT host and an upper-case ref", () => {
    for (const url of [
      `postgresql://postgres:${SECRET}@db.${PROD}.supabase.co:5432/postgres`,
      `postgresql://postgres.${PROD.toUpperCase()}:${SECRET}@${POOLER}:6543/postgres`,
    ]) {
      expect(() =>
        assertDeploymentTarget({ ...devEnv("preview"), DATABASE_URL: url }),
      ).toThrow(DeploymentTargetRefused);
    }
  });

  it("also guards a Vercel Development environment", () => {
    expect(() =>
      assertDeploymentTarget({
        ...devEnv("development"),
        DATABASE_URL: prodValueFor("DATABASE_URL"),
      }),
    ).toThrow(DeploymentTargetRefused);
  });

  it("never puts a credential or connection string in the error", () => {
    try {
      assertDeploymentTarget({
        ...devEnv("preview"),
        DATABASE_URL: prodValueFor("DATABASE_URL"),
      });
      throw new Error("expected a refusal");
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).not.toContain(SECRET);
      expect(msg).not.toMatch(/postgres(ql)?:\/\//);
      expect(msg).not.toContain(POOLER);
    }
  });
});

describe("what the tripwire leaves alone", () => {
  it("accepts a Preview wired to the development project", () => {
    expect(assertDeploymentTarget(devEnv("preview")).checked).toEqual([
      "DATABASE_URL",
      "DIRECT_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);
  });

  it("is a no-op in Production and in local `next dev` (no VERCEL_ENV)", () => {
    const prodEnv = {
      DATABASE_URL: prodValueFor("DATABASE_URL"),
      NEXT_PUBLIC_SUPABASE_URL: prodValueFor("NEXT_PUBLIC_SUPABASE_URL"),
    };
    expect(
      assertDeploymentTarget({ ...prodEnv, VERCEL_ENV: "production" }).checked,
    ).toEqual([]);
    expect(assertDeploymentTarget(prodEnv).checked).toEqual([]);
    expect(isNonProductionDeployment({})).toBe(false);
    expect(isNonProductionDeployment({ VERCEL_ENV: "Preview" })).toBe(true);
  });
});

describe("the tripwire is wired at build, server start, and client construction", () => {
  const read = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");

  it("next.config.ts runs it at build time", () => {
    expect(read("next.config.ts")).toMatch(
      /assertDeploymentTarget\(process\.env\)/,
    );
  });

  it("src/instrumentation.ts runs it on server start", () => {
    expect(read("src/instrumentation.ts")).toMatch(
      /export function register[\s\S]*assertDeploymentTarget\(/,
    );
  });

  it("src/lib/db.ts runs it before building the one Prisma client", () => {
    const db = read("src/lib/db.ts");
    const fn = db.slice(db.indexOf("function createPrismaClient"));
    expect(fn.indexOf("assertDeploymentTarget()")).toBeGreaterThan(-1);
    expect(fn.indexOf("assertDeploymentTarget()")).toBeLessThan(
      fn.indexOf("new PrismaClient"),
    );
  });
});
