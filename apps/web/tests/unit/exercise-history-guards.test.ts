import fs from "node:fs";
import path from "node:path";

/**
 * Exercise History & PR Intelligence — static guards (spec §14.1). The page
 * is a read: its modules write nothing, reconcile nothing, define no second
 * e1RM, and use no reward vocabulary. The pure modules stay client-safe.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) =>
  fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

function walk(dir: string, acc: string[] = []): string[] {
  const full = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(full)) return acc;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) walk(rel, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(rel);
  }
  return acc;
}

const PURE = [
  "src/lib/progression/history.ts",
  "src/lib/progression/history-format.ts",
  "src/lib/progression/history-types.ts",
];
const READ_ONLY = [
  ...PURE,
  "src/lib/progression/history-queries.ts",
  ...walk("src/app/(app)/exercises/[id]"),
];
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("exercise history static guards", () => {
  it("the pure modules import no database, server-only, or React code", () => {
    for (const f of PURE) {
      const src = read(f);
      expect(src).not.toMatch(/from "@prisma\/client"/);
      expect(src).not.toMatch(/from "@\/lib\/db"/);
      expect(src).not.toMatch(/"server-only"/);
      expect(src).not.toMatch(/from "react"/);
      expect(src).not.toMatch(/from "@\/lib\/data\//);
    }
  });

  it("nothing reached from the page writes or reconciles goals", () => {
    const write =
      /\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$transaction|reconcileGoalCompletions|"use server"/;
    for (const f of READ_ONLY) {
      expect({
        f,
        hit: write.exec(stripComments(read(f)))?.[0] ?? null,
      }).toEqual({
        f,
        hit: null,
      });
    }
    // The goals read added for the page is read-only too.
    const goals = read("src/lib/goals/queries.ts");
    const fn = goals.slice(
      goals.indexOf("export async function getExerciseGoals"),
    );
    expect(fn).not.toMatch(/reconcile|\.create\(|\.update\(|\$transaction/);
  });

  it("there is no second e1RM formula: history uses the canonical estimator", () => {
    const src = stripComments(read("src/lib/progression/history.ts"));
    expect(src).toMatch(/estimateOneRepMax/);
    expect(src).not.toMatch(/\/\s*30\b/);
    expect(src).not.toMatch(/\breps\s*\/|\/\s*reps\b/);
  });

  it("records are records, not rewards (AC-3)", () => {
    const reward =
      /new (pr|record)|personal best!|\bPR!|confetti|streak|🎉|congrat|achievement|unlock/i;
    for (const f of READ_ONLY) {
      expect({
        f,
        hit: reward.exec(stripComments(read(f)))?.[0] ?? null,
      }).toEqual({
        f,
        hit: null,
      });
    }
  });
});
