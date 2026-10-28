import fs from "node:fs";
import path from "node:path";

/**
 * Multi-User Foundation static guards (spec §9, §14.6; R7–R9). The account-
 * scoped layer is only a guarantee if nothing can walk around it, so these
 * checks run with every unit-test pass (the repository has no separate CI
 * service; lint + unit tests are the per-commit gate — spec R8).
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(REPO_ROOT, "src");
const DATA_LAYER = "src/lib/data/";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
const read = (f: string) => fs.readFileSync(f, "utf8");
/** Code only: comments may legitimately name what they forbid. */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const appFiles = () => walk(SRC).filter((f) => !rel(f).startsWith(DATA_LAYER));

describe("account-scoped access is the only door (Multi-User Foundation)", () => {
  // Any spelling of the raw client module — alias, relative, static, dynamic,
  // re-export — and any construction of a second client.
  const RAW_CLIENT =
    /(from\s+|import\s*\(\s*|require\s*\(\s*)["'](@\/lib\/db|(\.{1,2}\/)+(lib\/)?db)["']|new\s+PrismaClient\b|import\s*\{[^}]*\bPrismaClient\b[^}]*\}\s*from\s*["']@prisma\/client["']/;

  it("the raw-client pattern catches every spelling", () => {
    for (const src of [
      'import { prisma } from "@/lib/db";',
      'import { prisma } from "../db";',
      "import { prisma } from '../../lib/db';",
      'export { prisma } from "./db";',
      'const m = await import("@/lib/db");',
      'const { prisma } = require("../db");',
      "const c = new PrismaClient();",
      'import { PrismaClient } from "@prisma/client";',
    ]) {
      expect([src, RAW_CLIENT.test(src)]).toEqual([src, true]);
    }
    expect(
      RAW_CLIENT.test('import type { Prisma } from "@prisma/client";'),
    ).toBe(false);
  });

  it("only src/lib/data (and src/lib/db.ts itself) reaches the raw Prisma client", () => {
    const offenders = appFiles()
      .filter((f) => rel(f) !== "src/lib/db.ts")
      .filter((f) => RAW_CLIENT.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no raw SQL outside src/lib/data (raw queries bypass the scope)", () => {
    const offenders = appFiles().filter((f) =>
      /\$(queryRaw|executeRaw)(Unsafe)?\b/.test(code(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("application code never builds an Account for an arbitrary id", () => {
    const offenders = walk(SRC)
      .filter((f) => !rel(f).startsWith(DATA_LAYER))
      .filter((f) =>
        /@\/lib\/data\/operator|\bcreateAccountClient\b|\bresolveAccount(State)?\b|\btouchLastActive\b|\baccountFor\b/.test(
          code(f),
        ),
      );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("outside src/lib/data, userId appears only as the session-derived account.userId", () => {
    const offenders = walk(SRC)
      .filter((f) => !rel(f).startsWith(DATA_LAYER))
      .filter((f) => {
        const stripped = code(f)
          .replace(/\buserId:\s*account\.userId\b/g, "")
          .replace(/\baccount\.userId\b/g, "");
        return /\buserId\b/.test(stripped);
      });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("server actions resolve the acting account first and accept no account id", () => {
    const actions = walk(path.join(SRC, "app")).filter((f) =>
      /["']use server["']/.test(read(f)),
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const f of actions) {
      const src = code(f);
      expect([rel(f), /\b(accountId|ownerId|tenantId)\b/.test(src)]).toEqual([
        rel(f),
        false,
      ]);
    }
  });

  it("the Supabase client never queries application tables", () => {
    const offenders = walk(SRC).filter((f) =>
      /supabase[\w.]*\.from\(|\.from\(["'](mesocycles|sessions|session_exercises|exercises|exercise_favorites|gyms|gym_exercise_baselines|logged_sessions|logged_exercises|logged_sets|missed_day_resolutions|goals|planned_cardio|cardio_logs|profiles|tour_progress|release_seen|feedback|feedback_attachments|admin_audit_entries)["']\)/.test(
        code(f),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("eslint enforces the same boundary with no exemption beyond src/lib/data and db.ts", () => {
    const eslint = read(path.join(REPO_ROOT, "eslint.config.mjs"));
    expect(eslint).toMatch(
      /ignores:\s*\["src\/lib\/data\/\*\*", "src\/lib\/db\.ts"\]/,
    );
    expect(eslint).not.toMatch(/NOT_YET_SCOPED/);
  });
});
