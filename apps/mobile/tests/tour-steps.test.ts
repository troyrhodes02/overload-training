/**
 * Pitch 21k spec §7.3 (RD-2, RD-3, RD-24): the native anchor map over the
 * shared tour content.
 */
import fs from "node:fs";
import path from "node:path";
import {
  TOUR_CONTENT,
  TOUR_LOGGING_NO_START_BODY,
  TOUR_NATIVE_BODIES,
} from "@overload/shared/tour/content";
import {
  NATIVE_TOUR_STEPS,
  TOUR_ANCHORS,
  WEB_ONLY_TOUR_STEPS,
} from "../src/tour/steps";
import { TOUR_TAB_PATHS } from "../src/tour/types";

const SRC = path.resolve(__dirname, "..", "src");
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(full);
  }
  return acc;
}

describe("the native steps", () => {
  it("are the shared steps in the shared order, minus the two web-only ones", () => {
    const shared = TOUR_CONTENT.map((s) => s.id as string);
    expect(WEB_ONLY_TOUR_STEPS).toEqual(["plan-import", "plan-billing"]);
    expect(NATIVE_TOUR_STEPS.map((s) => s.id)).toEqual(
      shared.filter((id) => !WEB_ONLY_TOUR_STEPS.includes(id as never)),
    );
    expect(NATIVE_TOUR_STEPS.map((s) => s.id)).toEqual([
      "today",
      "logging",
      "navigation",
      "plan",
      "history",
      "goals",
      "exercises",
      "gyms",
      "settings",
    ]);
  });

  it("every shared step has a native decision (a new web step forces one)", () => {
    const decided = [
      ...NATIVE_TOUR_STEPS.map((s) => s.id),
      ...WEB_ONLY_TOUR_STEPS,
    ].sort();
    expect(decided).toEqual(TOUR_CONTENT.map((s) => s.id as string).sort());
  });

  it("use the shared words: titles verbatim, bodies verbatim or the shared native adaptation", () => {
    for (const step of NATIVE_TOUR_STEPS) {
      const shared = TOUR_CONTENT.find((s) => s.id === step.id)!;
      expect(step.title).toBe(shared.title);
      const native = (TOUR_NATIVE_BODIES as Record<string, string>)[step.id];
      expect(step.body).toBe(native ?? shared.body);
    }
    const logging = NATIVE_TOUR_STEPS.find((s) => s.id === "logging")!;
    expect(logging.fallbackBody).toBe(TOUR_LOGGING_NO_START_BODY);
    expect(logging.targets.map((t) => t.anchor)).toEqual([
      "today-start",
      "today-day",
    ]);
  });

  it("only the navigation step is a note; every other step names a target and a place", () => {
    for (const step of NATIVE_TOUR_STEPS) {
      expect(Object.keys(TOUR_TAB_PATHS)).toContain(step.tab);
      if (step.id === "navigation") {
        expect([step.kind, step.targets.length]).toEqual(["note", 0]);
        continue;
      }
      expect(step.kind).toBe("anchored");
      expect(step.targets.length).toBeGreaterThan(0);
      expect(step.where.length).toBeGreaterThan(0);
      for (const t of step.targets) {
        expect(TOUR_ANCHORS).toContain(t.anchor);
        expect(t.label).toMatch(/^the |^today's /);
      }
    }
  });
});

describe("the anchors in the source", () => {
  const files = walk(SRC).filter(
    (f) => !f.includes(`${path.sep}tour${path.sep}`),
  );
  const uses = (name: string) =>
    files.filter((f) => {
      const code = fs.readFileSync(f, "utf8");
      return (
        code.includes(`name="${name}"`) || code.includes(`tourAnchor="${name}"`)
      );
    });

  it.each(TOUR_ANCHORS.map((a) => [a]))(
    "%s is rendered by exactly one screen",
    (name) => {
      expect(uses(name).map((f) => path.relative(SRC, f))).toHaveLength(1);
    },
  );

  it("no tour sentence is written outside the shared package", () => {
    const sentences = [
      ...TOUR_CONTENT.map((s) => s.body),
      ...Object.values(TOUR_NATIVE_BODIES),
      TOUR_LOGGING_NO_START_BODY,
    ];
    for (const f of walk(SRC)) {
      const code = fs.readFileSync(f, "utf8");
      for (const sentence of sentences) {
        expect([
          path.relative(SRC, f),
          code.includes(sentence.slice(0, 40)),
        ]).toEqual([path.relative(SRC, f), false]);
      }
    }
  });
});
