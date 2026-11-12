import fs from "node:fs";
import path from "node:path";

/**
 * OVE-137 (mobile audit F-T11): the builders that compute Pro content with NO
 * capability check stay inside the progression read layer. Every surface —
 * page, server action, component, or a future mobile API route — must go
 * through a gated reader (getPlannedProgression, getOccurrenceProgression,
 * getSessionProgressionSummary, getExerciseHistory), which withholds Pro
 * fields from a Free account.
 *
 * `gatherRows` and `describeScope` are shared with history-queries.ts, which
 * gates its result through gateHistory; `getExerciseProgression` is used only
 * by the integration suites that verify the engine. So they stay exported, and
 * this guard pins who may import them.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");
const UNGATED = /\b(gatherRows|describeScope|getExerciseProgression)\b/;
const ALLOWED = new Set([
  "src/lib/progression/queries.ts",
  "src/lib/progression/history-queries.ts",
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(full);
  }
  return acc;
}
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");
const code = (f: string) =>
  fs
    .readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

it("no surface outside the progression read layer uses an ungated builder", () => {
  const offenders = walk(SRC)
    .filter((f) => !ALLOWED.has(rel(f)))
    .filter((f) => UNGATED.test(code(f)))
    .map(rel);
  expect(offenders).toEqual([]);
});

it("history-queries gates what it builds from the shared builders", () => {
  const history = code(path.join(SRC, "lib/progression/history-queries.ts"));
  expect(history).toMatch(/\bgateHistory\(/);
  expect(history).not.toMatch(/\bgetExerciseProgression\b/);
});

it("scripts never use an ungated builder either", () => {
  const offenders = walk(path.join(ROOT, "scripts"))
    .filter((f) => UNGATED.test(code(f)))
    .map(rel);
  expect(offenders).toEqual([]);
});
