import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Pitch 21a (Monorepo Move, spec §8.12): a moved test that no runner collects
 * passes by never running. Every test file in the web workspace must be
 * collected by exactly one Jest config, as Jest itself selects them
 * (`--listTests` applies each config's roots, testMatch, and
 * testPathIgnorePatterns), and every Playwright spec must sit in e2e/.
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

/** The files Jest itself collects for a config, relative to apps/web. */
function listTests(config: string): Set<string> {
  const out = execFileSync(
    process.execPath,
    [
      path.join(WEB_ROOT, "scripts", "jest.cjs"),
      "--listTests",
      "--config",
      config,
    ],
    { cwd: WEB_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return new Set(
    out
      .split(/\r?\n/)
      .filter((l) => l.startsWith(WEB_ROOT))
      .map(rel),
  );
}

const files = walk(WEB_ROOT).map(rel);
const jestFiles = files.filter((f) => /\.test\.tsx?$/.test(f));
const specFiles = files.filter((f) => /\.spec\.tsx?$/.test(f));
const unit = listTests("jest.config.js");
const integration = listTests("jest.integration.config.js");

describe("every test file is collected by a runner", () => {
  it("finds the suites it guards (never passes on an empty tree)", () => {
    expect(unit.size).toBeGreaterThanOrEqual(140);
    expect(integration.size).toBeGreaterThanOrEqual(90);
    expect(specFiles.length).toBeGreaterThan(0);
  });

  it("each Jest test file belongs to exactly one config", () => {
    const orphans = jestFiles.filter((f) => unit.has(f) === integration.has(f));
    expect(orphans).toEqual([]);
  });

  it("each Playwright spec sits under e2e/", () => {
    expect(specFiles.filter((f) => !f.startsWith("e2e/"))).toEqual([]);
  });
});
