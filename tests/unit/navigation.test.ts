import fs from "node:fs";
import path from "node:path";
import {
  NAV_ITEMS,
  isActive,
  isInMoreGroup,
  moreNavItems,
} from "@/components/shell/nav-items";
import { initialsOf } from "@/components/shell/account-footer";

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

  it("the Account & app group: Settings, Plan & Billing, What's New, Send feedback; Admin only for admins (OVE-119)", () => {
    expect(moreNavItems(false).map((i) => [i.href, i.label])).toEqual([
      ["/settings", "Settings"],
      ["/settings/billing", "Plan & Billing"],
      ["/settings/whats-new", "What's New"],
      ["/feedback", "Send feedback"],
    ]);
    expect(moreNavItems(true).map((i) => i.href)).toEqual([
      "/settings",
      "/settings/billing",
      "/settings/whats-new",
      "/feedback",
      "/admin",
    ]);
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
    // The more specific destination wins (OVE-119).
    ["/settings/billing", "/settings", false],
    ["/settings/billing", "/settings/billing", true],
    ["/settings/whats-new", "/settings/whats-new", true],
    ["/admin/accounts", "/admin", true],
  ])("%s with %s → %s", (pathname, href, expected) => {
    expect(isActive(pathname, href)).toBe(expected);
  });

  it("marks exactly one destination active on every app path", () => {
    const all = [...NAV_ITEMS, ...moreNavItems(true)];
    for (const p of [
      "/",
      "/plan/x",
      "/goals/new",
      "/gyms",
      "/settings",
      "/settings/billing",
      "/settings/whats-new",
      "/settings/delete-account",
      "/feedback",
    ]) {
      expect([p, all.filter((i) => isActive(p, i.href)).length]).toEqual([
        p,
        1,
      ]);
    }
  });

  it("the group knows when it holds the current page", () => {
    expect(isInMoreGroup("/settings/billing", false)).toBe(true);
    expect(isInMoreGroup("/plan", false)).toBe(false);
    expect(isInMoreGroup("/admin", false)).toBe(false);
    expect(isInMoreGroup("/admin", true)).toBe(true);
  });
});

describe("account footer initials", () => {
  const a = { firstName: "", lastName: "", username: "", email: "" };
  it.each([
    [{ ...a, firstName: "Jamie", lastName: "Smith" }, "JS"],
    [{ ...a, firstName: "jamie" }, "J"],
    [{ ...a, username: "lifter9" }, "L"],
    [{ ...a, email: "x@example.com" }, "X"],
    [a, "?"],
  ])("%j → %s", (acct, expected) => {
    expect(initialsOf(acct)).toBe(expected);
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

  it("the sidebar stays hidden below md and keeps its md+ classes", () => {
    const nav = fs.readFileSync(
      path.join(SRC, "components/shell/app-nav.tsx"),
      "utf8",
    );
    expect(nav).toContain('"hidden md:flex md:flex-col"');
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

describe("no ⋮ account menu in the app shell (OVE-119)", () => {
  const SRC = path.join(process.cwd(), "src");
  it("the shell renders no account menu; sign out lives in the account footer", () => {
    const shell = fs.readFileSync(
      path.join(SRC, "components/shell/app-shell.tsx"),
      "utf8",
    );
    expect(shell).not.toMatch(/AccountMenu/);
    const footer = fs.readFileSync(
      path.join(SRC, "components/shell/account-footer.tsx"),
      "utf8",
    );
    expect(footer).toMatch(/signOutAction/);
    for (const f of ["app-nav.tsx", "mobile-nav.tsx"]) {
      expect(
        fs.readFileSync(path.join(SRC, "components/shell", f), "utf8"),
      ).toMatch(/<AccountFooter account=\{account\} \/>/);
    }
  });
});

describe("the Account & app group animates instead of popping (OVE-119)", () => {
  it("renders open with a height-and-fade transition, never the hidden attribute", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");
    const { NavMoreGroup } = await import("@/components/shell/nav-more-group");
    const html = renderToStaticMarkup(
      React.createElement(
        NavMoreGroup,
        // Children go as the third argument (react/no-children-prop); the
        // cast satisfies the props type, which declares children required.
        { containsCurrent: false } as Parameters<typeof NavMoreGroup>[0],
        React.createElement("a", { href: "/settings" }, "Settings"),
      ),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("grid-rows-[1fr]");
    expect(html).not.toMatch(/\shidden(=|\s|>)/);
    expect(html).not.toContain("inert");
    // The first render never animates (no transition until mounted).
    expect(html).not.toContain("transition-[grid-template-rows,opacity]");
  });

  it("uses the grid-rows technique with a reduced-motion opt-out", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/shell/nav-more-group.tsx"),
      "utf8",
    );
    expect(src).toContain('"grid-rows-[1fr] opacity-100"');
    expect(src).toContain('"grid-rows-[0fr] opacity-0"');
    expect(src).toContain("motion-reduce:transition-none");
    expect(src).toMatch(/inert=\{!shown\}/);
  });
});
