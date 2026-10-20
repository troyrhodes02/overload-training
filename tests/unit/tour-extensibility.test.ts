import fs from "node:fs";
import path from "node:path";
import {
  TOUR_ANCHORS,
  TOUR_STEPS,
  type TourStep,
  type TourTarget,
} from "@/lib/tour/steps";
import {
  counter,
  nextIndex,
  resolveTarget,
  stepsForLayout,
} from "@/lib/tour/engine";

/**
 * AC-4 — a new step is data only (Onboarding Tour spec §14.1; R9). A step
 * added to the registry is walked in order by the unchanged engine, and the
 * mechanism files hold no step data at all, so there is nothing in them to
 * edit when a step is added.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}
const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
/** Code only: comments may name what they forbid. */
const code = (f: string) =>
  fs
    .readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const MECHANISM = [
  path.join(REPO_ROOT, "src/lib/tour/engine.ts"),
  path.join(REPO_ROOT, "src/lib/tour/dom.ts"),
  ...walk(path.join(REPO_ROOT, "src/components/tour")),
];

it("a data-only step is visited in order, and Back returns to the step before it", () => {
  // A future pitch's step, written exactly as the registry's own.
  const target: TourTarget = { anchor: "page-goals" };
  const history: TourStep = {
    id: "exercise-history",
    route: "/goals",
    targets: [target],
    title: "Exercise history",
    body: "See how a lift has gone over time.",
  };
  const registry = [...TOUR_STEPS];
  registry.splice(registry.findIndex((s) => s.id === "goals") + 1, 0, history);

  const steps = stepsForLayout(registry, "desktop");
  const visited: string[] = [];
  const skipped = new Set<string>();
  for (let i = 0; i < steps.length; i = nextIndex(steps, skipped, i, 1)) {
    // Every target is "on screen" in this walk.
    expect(resolveTarget(steps[i], () => true)).not.toBeNull();
    visited.push(steps[i].id);
  }
  expect(visited).toEqual([
    "today",
    "logging",
    "plan",
    "history",
    "goals",
    "exercise-history",
    "gyms",
    "settings",
  ]);
  const at = steps.findIndex((s) => s.id === "exercise-history");
  expect(steps[nextIndex(steps, skipped, at, -1)].id).toBe("goals");
  expect(counter(steps, skipped, at)).toEqual({ position: 6, total: 8 });
});

it("the mechanism files contain no step ids, step routes, anchor names, or copy", () => {
  const forbidden = [
    ...TOUR_STEPS.map((s) => `"${s.id}"`),
    ...TOUR_STEPS.filter((s) => s.route !== "/").map((s) => `"${s.route}"`),
    ...TOUR_ANCHORS.map((a) => `"${a}"`),
    ...TOUR_STEPS.map((s) => s.title),
  ];
  const offenders: string[] = [];
  for (const f of MECHANISM) {
    const src = code(f);
    for (const token of forbidden) {
      if (src.includes(token)) offenders.push(`${rel(f)}: ${token}`);
    }
  }
  expect(offenders).toEqual([]);
});

it("only the provider reads the registry's steps (as an overridable default)", () => {
  const readers = walk(path.join(REPO_ROOT, "src"))
    .filter((f) => /\bTOUR_STEPS\b/.test(code(f)))
    .map(rel);
  expect(readers.sort()).toEqual(
    ["src/components/tour/tour-provider.tsx", "src/lib/tour/steps.ts"].sort(),
  );
  const provider = code(
    path.join(REPO_ROOT, "src/components/tour/tour-provider.tsx"),
  );
  expect(provider).toMatch(/steps = TOUR_STEPS/);
});

it("no third-party tour library is a dependency (standing resolution)", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
  ) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  expect(
    names.filter((n) =>
      /tour|joyride|shepherd|intro\.?js|driver\.js|reactour|onboard|floating-ui|popper/i.test(
        n,
      ),
    ),
  ).toEqual([]);
});
