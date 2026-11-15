/** Pitch 21d spec §8 (RD-2): the shared tokens are the only visual authority. */
import fs from "node:fs";
import path from "node:path";
import { colors } from "@overload/shared/design/tokens";
import { buildTheme, resolveScheme } from "../src/ui/theme";

describe("native theme", () => {
  it("uses the shared tokens exactly, in both appearances", () => {
    expect(buildTheme("light").colors).toBe(colors.light);
    expect(buildTheme("dark").colors).toBe(colors.dark);
  });

  it("the account preference overrides the device; system follows it", () => {
    expect(resolveScheme("light", "dark")).toBe("light");
    expect(resolveScheme("dark", "light")).toBe("dark");
    expect(resolveScheme("system", "dark")).toBe("dark");
    expect(resolveScheme("system", "light")).toBe("light");
    expect(resolveScheme("system", null)).toBe("light");
  });

  it("no color literal exists in the app's source outside the theme", () => {
    const SRC = path.resolve(__dirname, "..", "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (
          /\.tsx?$/.test(e.name) &&
          !full.endsWith(path.join("ui", "theme.ts"))
        ) {
          const code = fs.readFileSync(full, "utf8");
          if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(code))
            offenders.push(path.relative(SRC, full));
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});
