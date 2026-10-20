import fs from "node:fs";
import path from "node:path";
import { TOUR_ANCHORS, TOUR_STEPS, tourAnchor } from "@/lib/tour/steps";

/**
 * The onboarding tour registry (Onboarding Tour spec §12–§14.1; R9, R32): one
 * valid, ordered list whose copy is the design doc's, covering the pitch's
 * seven areas, where every anchor it names is really rendered somewhere.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(REPO_ROOT, "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}
const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");

describe("registry validity", () => {
  it("has unique, stable-looking ids", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("every step has an absolute route, at least one known target, and copy", () => {
    for (const s of TOUR_STEPS) {
      expect([s.id, s.route.startsWith("/")]).toEqual([s.id, true]);
      expect(s.targets.length).toBeGreaterThan(0);
      for (const t of s.targets) {
        expect(TOUR_ANCHORS).toContain(t.anchor);
        expect([undefined, "right", "below"]).toContain(t.side);
      }
      expect([undefined, "phone", "desktop"]).toContain(s.layout);
      for (const text of [s.title, s.body, ...s.targets.map((t) => t.body)]) {
        if (text === undefined) continue;
        expect(text.trim().length).toBeGreaterThan(0);
        // Plain copy: no emoji, no exclamation marks, no "simply".
        expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(text).not.toMatch(/!|\bsimply\b/i);
      }
    }
  });

  it("tourAnchor writes the data-tour attribute", () => {
    expect(tourAnchor("page-plan")).toEqual({ "data-tour": "page-plan" });
  });

  it("covers the pitch's seven areas, from today's workout outward", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      "today",
      "logging",
      "navigation",
      "plan",
      "history",
      "goals",
      "gyms",
      "settings",
    ]);
    const routes = new Set(TOUR_STEPS.map((s) => s.route));
    for (const r of [
      "/",
      "/plan",
      "/history",
      "/goals",
      "/gyms",
      "/settings",
    ]) {
      expect(routes).toContain(r);
    }
  });

  it("the only phone-only step is the menu button; rail targets ask for the right side", () => {
    expect(
      TOUR_STEPS.filter((s) => s.layout !== undefined).map((s) => [
        s.id,
        s.layout,
      ]),
    ).toEqual([["navigation", "phone"]]);
    for (const s of TOUR_STEPS) {
      for (const t of s.targets) {
        if (t.anchor.startsWith("nav-") && t.anchor !== "nav-menu") {
          expect([t.anchor, t.side]).toEqual([t.anchor, "right"]);
        }
      }
    }
  });
});

describe("copy is the design doc's, verbatim (R32)", () => {
  const doc = fs.readFileSync(
    path.join(REPO_ROOT, "docs/design/11-onboarding-tour-design-doc.md"),
    "utf8",
  );
  const section = doc.slice(
    doc.indexOf("### The initial tour"),
    doc.indexOf("Width behavior"),
  );
  type Row = { id: string; title: string; body: string };
  const rows: Row[] = [];
  for (const line of section.split("\n")) {
    if (!/^\| (\d+)? *\|/.test(line)) continue;
    const cols = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    const id = cols[1].replace(/`/g, "") || rows[rows.length - 1].id;
    rows.push({ id, title: cols[4].replace(/\*\*/g, ""), body: cols[5] });
  }

  it("the design doc table was found", () => {
    expect(rows.length).toBe(9); // eight steps + the logging step's (b) body
  });

  it.each(TOUR_STEPS.map((s) => [s.id, s]))(
    "%s: title and every body match",
    (_id, step) => {
      const mine = rows.filter((r) => r.id === step.id);
      expect(mine.length).toBeGreaterThan(0);
      for (const r of mine) expect(r.title).toBe(step.title);
      const bodies = [
        step.body,
        ...step.targets.flatMap((t) => (t.body ? [t.body] : [])),
      ];
      expect(mine.map((r) => r.body)).toEqual(bodies);
    },
  );
});

describe("every anchor names a control the app renders", () => {
  const files = walk(SRC).filter((f) => !rel(f).startsWith("src/lib/tour/"));
  const code = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  it.each(TOUR_ANCHORS.map((a) => [a]))("%s is rendered", (anchor) => {
    const placed =
      code.includes(`tourAnchor("${anchor}")`) ||
      code.includes(`tourAnchor: "${anchor}"`);
    expect([anchor, placed]).toEqual([anchor, true]);
  });

  it("every anchor in TOUR_ANCHORS is used by some step", () => {
    const used = new Set(
      TOUR_STEPS.flatMap((s) => s.targets.map((t) => t.anchor)),
    );
    expect([...TOUR_ANCHORS].filter((a) => !used.has(a))).toEqual([]);
  });

  it("rail anchors live on the md+ rail only, never in the phone sheet", () => {
    const sheet = fs.readFileSync(
      path.join(SRC, "components/shell/mobile-nav.tsx"),
      "utf8",
    );
    expect(sheet).not.toMatch(/item\.tourAnchor|navItem\.tourAnchor/);
    const rail = fs.readFileSync(
      path.join(SRC, "components/shell/app-nav.tsx"),
      "utf8",
    );
    expect(rail).toMatch(/tourAnchor\(item\.tourAnchor\)/);
  });
});
