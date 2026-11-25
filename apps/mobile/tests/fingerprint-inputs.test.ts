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

describe("native fingerprint inputs", () => {
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
    expect(config.match(/colors\.[a-z]+\.[a-zA-Z]+/g)).toEqual([
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
