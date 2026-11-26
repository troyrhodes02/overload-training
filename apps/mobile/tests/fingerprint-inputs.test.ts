/**
 * Pitch 21e (RD-17, OVE-209): files that app.config.ts imports are part of
 * Expo's runtime fingerprint. Changing one cuts the installed development
 * build off from over-the-air updates until a new native build. tokens.ts is
 * one (the splash background), so its bytes are pinned here. New shared colors
 * go in packages/shared/src/design/status-colors.ts until the next native
 * rebuild; then move them into tokens.ts and update this hash together with
 * the new build.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TOKENS = path.resolve(
  __dirname,
  "../../../packages/shared/src/design/tokens.ts",
);

const ENVIRONMENT = path.resolve(
  __dirname,
  "../../../packages/shared/src/mobile/environment.ts",
);

describe("native fingerprint inputs", () => {
  it("environment.ts is byte-identical to installed build c22ac9a0's input (runtime 2e4a65d9cd; 21l RD-19)", () => {
    // app.config.ts loads it for every staging build and update, so any
    // change moves the staging runtime and cuts the installed development
    // build off from staging updates. Production rules go in
    // production-environment.ts, which the config loads only for Production.
    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(ENVIRONMENT))
      .digest("hex");
    expect(hash).toBe(
      "f46a5039255a64d25a0bbf75b48bb60e67950ef46b42996cd1ef3f965b92b5a4",
    );
  });

  it("app.config.ts imports only environment.ts and tokens.ts at the top, and loads the Production module only for a Production target", () => {
    const config = fs.readFileSync(
      path.resolve(__dirname, "../app.config.ts"),
      "utf8",
    );
    const imports = [...config.matchAll(/^import [^;]*? from "([^"]+)";/gms)]
      .map((m) => m[1])
      .filter((p) => !p.startsWith("expo/"));
    expect(imports).toEqual([
      "../../packages/shared/src/mobile/environment.ts",
      "../../packages/shared/src/design/tokens.ts",
    ]);
    const requires = [...config.matchAll(/require\("([^"]+)"\)/g)].map(
      (m) => m[1],
    );
    expect(requires).toEqual([
      "../../packages/shared/src/mobile/production-environment.ts",
    ]);
    const body = config.slice(config.indexOf("function productionConfig"));
    expect(body.indexOf("require(")).toBeLessThan(
      body.indexOf("export default"),
    );
  });

  it("tokens.ts is unchanged since the installed build (runtime f98506f78a)", () => {
    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(TOKENS))
      .digest("hex");
    expect(hash).toBe(
      "86ef2d5136726e54501cd8e3e05f6a22bac99cf9e9981ef161b349e6bffcca04",
    );
  });

  it("app.config.ts still imports only the splash colors from tokens.ts", () => {
    const config = fs.readFileSync(
      path.resolve(__dirname, "../app.config.ts"),
      "utf8",
    );
    // Both targets (staging and, since 21l, Production) use the same two.
    expect([...new Set(config.match(/colors\.[a-z]+\.[a-zA-Z]+/g))]).toEqual([
      "colors.light.background",
      "colors.dark.background",
    ]);
  });

  it("expo-file-system is declared at exactly the range expo itself links (Pitch 21j RD-8)", () => {
    const mobile = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const expo = JSON.parse(
      fs.readFileSync(require.resolve("expo/package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    // A different range could resolve another version and move the runtime.
    expect(mobile.dependencies["expo-file-system"]).toBe(
      expo.dependencies["expo-file-system"],
    );
  });
});
