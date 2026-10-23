import fs from "node:fs";
import path from "node:path";
import {
  NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  isActive,
} from "@/components/shell/nav-items";

/**
 * Phone navigation (Personalization & Navigation Polish, spec §14.6–14.7):
 * one destination list for the rail and the sheet, the same active rule, no
 * change to the destinations, and no stale "above the bottom nav" offsets.
 */

describe("navigation destinations", () => {
  it("keeps the existing destinations, labels, and order (no IA change)", () => {
    expect(NAV_ITEMS.map((i) => [i.href, i.label])).toEqual([
      ["/", "Today"],
      ["/plan", "Plan"],
      ["/history", "History"],
      ["/goals", "Goals"],
      ["/exercises", "Exercises"],
      ["/gyms", "Gyms"],
    ]);
  });

  it("adds only Settings and Send feedback, as sheet-only secondary entries (never Admin)", () => {
    expect(SECONDARY_NAV_ITEMS.map((i) => [i.href, i.label])).toEqual([
      ["/settings", "Settings"],
      ["/feedback", "Send feedback"],
    ]);
    // Admin Center & Feedback: the admin area is never a navigation entry.
    const hrefs = [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS].map((i) => i.href);
    expect(hrefs.some((h) => h.startsWith("/admin"))).toBe(false);
  });
});

describe("isActive", () => {
  it.each([
    ["/", "/", true],
    ["/plan", "/", false],
    ["/plan", "/plan", true],
    ["/plan/abc/sessions/def", "/plan", true],
    ["/planx", "/plan", false],
    ["/history/123", "/history", true],
    ["/settings/delete-account", "/settings", true],
    ["/settings", "/gyms", false],
  ])("%s with %s → %s", (pathname, href, expected) => {
    expect(isActive(pathname, href)).toBe(expected);
  });

  it("marks at most one destination active on any path", () => {
    for (const p of ["/", "/plan/x", "/goals/new", "/gyms", "/settings"]) {
      const all = [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS];
      expect(all.filter((i) => isActive(p, i.href)).length).toBeLessThanOrEqual(
        1,
      );
    }
  });
});

describe("phone layout guards", () => {
  const SRC = path.join(process.cwd(), "src");
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return files(full);
      return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });

  it("no thumb-reach bar is offset for the removed bottom navigation bar", () => {
    const offenders = files(SRC)
      .filter((f) => /\bbottom-16\b/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(process.cwd(), f));
    expect(offenders).toEqual([]);
  });

  it("the rail stays hidden below md and keeps its md+ classes", () => {
    const nav = fs.readFileSync(
      path.join(SRC, "components/shell/app-nav.tsx"),
      "utf8",
    );
    expect(nav).toContain('"hidden md:block"');
    expect(nav).toContain(
      '"md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-t-0 md:bg-transparent"',
    );
  });

  it("the menu button is phone-only", () => {
    const mobile = fs.readFileSync(
      path.join(SRC, "components/shell/mobile-nav.tsx"),
      "utf8",
    );
    expect(mobile).toMatch(/aria-label="Open navigation"/);
    expect(mobile).toMatch(/md:hidden/);
  });
});
