import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Workout Plan Import & Review (OVE-109, blueprint §4.4/§8 threats 4 & 7) —
 * privacy hardening guards.
 *
 * The raw sources may hold names, personal notes, location metadata, or visible
 * surroundings. These static guards assert the project keeps them out of the
 * client bundle, out of logs, and out of error surfaces:
 *  - the client-bundle check forbids the provider key and the server-only import
 *    config tokens (so a leaked NEXT_PUBLIC_ or accidental client import fails
 *    the build);
 *  - no import module logs source bytes, filenames, prompt bodies, or page
 *    images (the only console.* in the import tree are deletion/sweep diagnostics
 *    with no content), enforced by grepping the import tree.
 */

const ROOT = path.join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("client-bundle guard forbids import secrets", () => {
  const checker = read("scripts/check-client-bundle.mjs");
  it.each([
    "ANTHROPIC_API_KEY",
    "PLAN_IMPORT_ENABLED",
    "PLAN_IMPORT_MODEL",
    "PLAN_IMPORT_MONTHLY_SPEND_MICROS",
  ])("lists %s as a forbidden client-bundle token", (token) => {
    expect(checker).toContain(`"${token}"`);
  });

  it("checks the provider key VALUE too, not just its name", () => {
    expect(checker).toContain("process.env.ANTHROPIC_API_KEY");
  });
});

describe("no source content is logged by the import tree", () => {
  // The import feature modules. The extraction prompt/port must never console.*
  // source text; the lifecycle/review/confirm/retention must never log paths or
  // content. (Operator scripts print counts only and are tested separately.)
  const files = [
    "src/lib/import/extract.ts",
    "src/lib/import/confirm.ts",
    "src/lib/import/review.ts",
    "src/lib/import/sessions.ts",
    "src/lib/import/retention.ts",
    "src/lib/import/storage.ts",
    "src/lib/import/spend.ts",
    "src/lib/import/usage.ts",
    "src/lib/import/extraction/anthropic.ts",
    "src/lib/import/extraction/prompt.ts",
    "src/lib/import/extraction/port.ts",
  ];

  it.each(files)("%s contains no console.* call", (rel) => {
    const src = read(rel);
    // No console.log/info/warn/error/debug anywhere in the import feature code:
    // the safe error CATEGORY is the only thing that ever leaves these modules.
    expect(src).not.toMatch(/console\.(log|info|warn|error|debug)\s*\(/);
  });
});

describe("error codes carry no source content", () => {
  it("the port's error taxonomy is a closed set of safe categories", () => {
    const port = read("src/lib/import/extraction/port.ts");
    // Every ExtractionErrorCode is a provider/parse CATEGORY, never a message
    // with content. Spot-check the union is categories only.
    for (const code of [
      "provider_rate_limited",
      "provider_unavailable",
      "provider_timeout",
      "provider_rejected",
      "provider_unauthorized",
      "malformed_output",
      "cancelled",
      "provider_unconfigured",
    ]) {
      expect(port).toContain(code);
    }
  });
});
