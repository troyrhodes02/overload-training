import fs from "node:fs";
import path from "node:path";
import { THEME_COLORS } from "@overload/shared/appearance/appearance";
import {
  colors,
  controlHeight,
  overlay,
  radius,
  type ColorTokens,
} from "@overload/shared/design/tokens";
import { WEB_SRC } from "../support/code-roots";

/**
 * Pitch 21b: the shared design tokens are plain values for the iPhone app; the
 * web keeps styling from globals.css with Tailwind and shadcn/ui. This test
 * keeps the two equal, so neither can change a color, radius, or control size
 * alone.
 */
const css = fs.readFileSync(path.join(WEB_SRC, "app", "globals.css"), "utf8");

/** The declarations of the first block whose selector line matches. */
function block(selector: RegExp): Record<string, string> {
  const m = selector.exec(css);
  if (!m) throw new Error(`no block for ${selector}`);
  const body = css.slice(m.index + m[0].length, css.indexOf("}", m.index));
  const out: Record<string, string> = {};
  for (const d of body.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)) {
    out[d[1]] = d[2].trim();
  }
  return out;
}

const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** The color custom properties of a block, keyed like ColorTokens. */
function colorTokens(decls: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(decls)
      .filter(([k]) => k !== "radius")
      .map(([k, v]) => [camel(k), v]),
  );
}

describe("design tokens match globals.css", () => {
  it("light colors are the :root block, every token and nothing else", () => {
    expect(colorTokens(block(/^:root\s*\{/m))).toEqual(colors.light);
  });

  it("dark colors are the .dark block", () => {
    expect(colorTokens(block(/^\.dark\s*\{/m))).toEqual(colors.dark);
  });

  it("System on a dark device uses the same dark colors", () => {
    expect(colorTokens(block(/^\s*:root:not\(\.light\)\s*\{/m))).toEqual(
      colors.dark,
    );
  });

  it("every token has a light and a dark value", () => {
    const keys = (t: ColorTokens) => Object.keys(t).sort();
    expect(keys(colors.light)).toEqual(keys(colors.dark));
    expect(keys(colors.light)).toHaveLength(21);
  });

  it("radius: --radius is lg; sm, md, xl are its steps", () => {
    expect(block(/^:root\s*\{/m).radius).toBe(`${radius.lg / 16}rem`);
    expect(css).toMatch(
      new RegExp(
        `--radius-sm: calc\\(var\\(--radius\\) - ${radius.lg - radius.sm}px\\)`,
      ),
    );
    expect(css).toMatch(
      new RegExp(
        `--radius-md: calc\\(var\\(--radius\\) - ${radius.lg - radius.md}px\\)`,
      ),
    );
    expect(css).toMatch(/--radius-lg: var\(--radius\)/);
    expect(css).toMatch(
      new RegExp(
        `--radius-xl: calc\\(var\\(--radius\\) \\+ ${radius.xl - radius.lg}px\\)`,
      ),
    );
  });

  it("browser chrome colors are the background tokens", () => {
    expect(THEME_COLORS).toEqual({
      light: colors.light.background,
      dark: colors.dark.background,
    });
  });

  it("control heights and the overlay match the shadcn/ui components", () => {
    const ui = (f: string) =>
      fs.readFileSync(path.join(WEB_SRC, "components", "ui", f), "utf8");
    // Tailwind's spacing unit is 4px: h-9 = 36, h-10 = 40, h-11 = 44.
    const button = ui("button.tsx");
    expect(button).toMatch(new RegExp(`sm: "h-${controlHeight.sm / 4} `));
    expect(button).toMatch(new RegExp(`default: "h-${controlHeight.md / 4} `));
    expect(button).toMatch(new RegExp(`lg: "h-${controlHeight.lg / 4} `));
    expect(ui("input.tsx")).toMatch(new RegExp(`h-${controlHeight.md / 4} `));
    expect(overlay).toBe("rgba(0, 0, 0, 0.5)");
    for (const f of ["dialog.tsx", "sheet.tsx", "alert-dialog.tsx"]) {
      expect(ui(f)).toMatch(/bg-black\/50/);
    }
  });
});
