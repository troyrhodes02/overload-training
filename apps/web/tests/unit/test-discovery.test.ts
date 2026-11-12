import fs from "node:fs";
import path from "node:path";

/**
 * Pitch 21a (Monorepo Move, spec §8.12): a moved test that no runner collects
 * passes by never running. Every test file in the web workspace must be
 * collected by exactly one of the runners, so the guards that protect account
 * isolation, history, entitlements, and secrets keep running.
 */

const WEB_ROOT = path.resolve(__dirname, "..", "..");
const SKIP = new Set([
  "node_modules",
  ".next",
  "test-results",
  "playwright-report",
  "blob-report",
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const rel = (f: string) => path.relative(WEB_ROOT, f).replace(/\\/g, "/");
const roots = (config: { roots: string[] }) =>
  config.roots.map((r) => rel(r.replace("<rootDir>", WEB_ROOT)) + "/");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const unitConfig = require("../../jest.config.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const integrationConfig = require("../../jest.integration.config.js");

const files = walk(WEB_ROOT).map(rel);
const jestFiles = files.filter((f) => /\.test\.tsx?$/.test(f));
const specFiles = files.filter((f) => /\.spec\.tsx?$/.test(f));

const collectedByUnit = (f: string) =>
  roots(unitConfig).some((r) => f.startsWith(r)) && !/\.int\.test\.ts$/.test(f);
const collectedByIntegration = (f: string) =>
  roots(integrationConfig).some((r) => f.startsWith(r)) &&
  /\.int\.test\.ts$/.test(f);

describe("every test file is collected by a runner", () => {
  it("finds the suites it guards (never passes on an empty tree)", () => {
    expect(jestFiles.filter(collectedByUnit).length).toBeGreaterThanOrEqual(
      140,
    );
    expect(
      jestFiles.filter(collectedByIntegration).length,
    ).toBeGreaterThanOrEqual(90);
    expect(specFiles.length).toBeGreaterThan(0);
  });

  it("each Jest test file belongs to exactly one config", () => {
    const orphans = jestFiles.filter(
      (f) => collectedByUnit(f) === collectedByIntegration(f),
    );
    expect(orphans).toEqual([]);
  });

  it("each Playwright spec sits under e2e/", () => {
    expect(specFiles.filter((f) => !f.startsWith("e2e/"))).toEqual([]);
  });
});
