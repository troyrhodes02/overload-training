/** Pitch 21d spec §8 (RD-2): the shared tokens are the only visual authority. */
import fs from "node:fs";
import path from "node:path";
import { colors } from "@overload/shared/design/tokens";
import { statusColors } from "@overload/shared/design/status-colors";
import { buildTheme, resolveScheme, tint } from "../src/ui/theme";

describe("native theme", () => {
  it("uses the shared tokens exactly, in both appearances", () => {
    expect(buildTheme("light").colors).toEqual({
      ...colors.light,
      ...statusColors.light,
    });
    expect(buildTheme("dark").colors).toEqual({
      ...colors.dark,
      ...statusColors.dark,
    });
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

  it("tint derives a translucent fill from a token, never a new color", () => {
    expect(tint("#0159fd", 0.14)).toBe("#0159fd24");
    expect(tint("#0159fd", 0)).toBe("#0159fd00");
    expect(tint("#0159fd", 2)).toBe("#0159fdff");
    expect(tint("not-a-hex", 0.5)).toBe("not-a-hex");
  });

  it("the attention color reads at AA on cards and the background, both appearances (RD-25)", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const [r, g, b] = c.map((x) =>
        x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const scheme of ["light", "dark"] as const) {
      const c = buildTheme(scheme).colors;
      expect(ratio(c.attention, c.card)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.attention, c.background)).toBeGreaterThanOrEqual(4.5);
      // Its own color: never the primary brand accent.
      expect(c.attention).not.toBe(c.primary);
    }
  });
});
