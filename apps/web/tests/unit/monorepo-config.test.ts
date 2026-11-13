import fs from "node:fs";
import path from "node:path";
import nextConfig from "../../next.config";

/**
 * Pitch 21a (Monorepo Move, spec §8.5, §8.12): the web app is apps/web of an
 * npm workspace whose dependencies are hoisted to the workspace root. Two
 * settings would otherwise break silently (mobile audit Q-2):
 *   - Turbopack resolves only inside its root, so the root must be the
 *     workspace root, and file tracing must use the same root;
 *   - the pdfjs-dist tracing include must point where npm actually put the
 *     package, or PDF plan import fails only in the deployed function.
 */

const WEB_ROOT = path.resolve(__dirname, "..", "..");

describe("monorepo build configuration", () => {
  it("roots Turbopack and file tracing at the npm workspace root", () => {
    const root = nextConfig.turbopack?.root;
    expect(root).toBeDefined();
    expect(nextConfig.outputFileTracingRoot).toBe(root);
    expect(path.resolve(root as string)).toBe(
      path.resolve(WEB_ROOT, "..", ".."),
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root as string, "package.json"), "utf8"),
    );
    expect(manifest.workspaces).toEqual(["apps/*", "packages/*"]);
    expect(fs.existsSync(path.join(root as string, "package-lock.json"))).toBe(
      true,
    );
  });

  it("traces the real pdfjs-dist into the plan-import function", () => {
    const includes = nextConfig.outputFileTracingIncludes?.["/plan/import"];
    expect(includes).toHaveLength(2);
    const installed = path.dirname(require.resolve("pdfjs-dist/package.json"));
    // Patterns resolve from the Next project root (apps/web).
    const [manifest, legacy] = (includes ?? []).map((p) =>
      path.resolve(WEB_ROOT, p),
    );
    expect(manifest).toBe(path.join(installed, "package.json"));
    expect(legacy).toBe(path.join(installed, "legacy", "build", "**", "*"));
    expect(
      fs.existsSync(path.join(installed, "legacy", "build", "pdf.mjs")),
    ).toBe(true);
  });
});
