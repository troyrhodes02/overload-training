import fs from "node:fs";
import path from "node:path";
import {
  SHARED_SRC,
  WEB_ROOT,
  WEB_SRC,
  relToWeb,
  walkCode,
  walkTs,
} from "../support/code-roots";

/**
 * Pitch 21b — Shared Package & Contracts. The web consumes the shared package,
 * each moved rule has exactly one definition (in the package), and the
 * package holds no access control, data access, or server code.
 */
const code = (f: string) =>
  fs
    .readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every module moved out of apps/web/src/lib (spec §5.2, §5.3). */
const MOVED = [
  "accounts/auth-errors",
  "accounts/validation",
  "appearance/appearance",
  "appearance/choices",
  "cardio/schedule",
  "cardio/validation",
  "entitlements/types",
  "exercises/gym-variable",
  "exercises/loading-mode",
  "exercises/taxonomy",
  "exercises/validation",
  "feedback/attachment-validation",
  "feedback/validation",
  "goals/dashboard",
  "goals/progress",
  "goals/validation",
  "gyms/validation",
  "logging/rir",
  "logging/schedule",
  "logging/set-entry",
  "logging/weight",
  "plan/calendar",
  "plan/presets",
  "plan/readiness",
  "plan/rep-target",
  "plan/validation",
  "plan/weekday-names",
  "progression/config",
  "progression/deload",
  "progression/e1rm",
  "progression/engine",
  "progression/history",
  "progression/history-format",
  "progression/history-types",
  "progression/recommendation",
  "progression/types",
  "release-notes/catalog",
  "release-notes/entries",
  "release-notes/types",
];

describe("the web consumes @overload/shared", () => {
  it("declares the package and transpiles it", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(WEB_ROOT, "package.json"), "utf8"),
    );
    expect(pkg.dependencies["@overload/shared"]).toBe("*");
    const nextConfig = fs.readFileSync(
      path.join(WEB_ROOT, "next.config.ts"),
      "utf8",
    );
    expect(nextConfig).toMatch(/transpilePackages:\s*\["@overload\/shared"\]/);
  });

  it.each(MOVED)("%s lives only in the shared package", (mod) => {
    expect(fs.existsSync(path.join(WEB_SRC, "lib", `${mod}.ts`))).toBe(false);
    expect(fs.existsSync(path.join(SHARED_SRC, `${mod}.ts`))).toBe(true);
  });

  it("web code reaches the package by its name, never by a relative path", () => {
    const offenders = walkTs(WEB_SRC)
      .filter((f) => /from\s+["'][^"']*packages\/shared/.test(code(f)))
      .map(relToWeb);
    expect(offenders).toEqual([]);
  });
});

describe("one definition per shared rule", () => {
  // Each name is defined once, in the shared package. A second definition
  // anywhere (a copied rule) fails, as does losing the shared one.
  const RULES = [
    "estimateOneRepMax",
    "isGymVariable",
    "requiresExternalWeight",
    "checkWeightLbs",
    "WEIGHT_LBS_MAX",
    "checkLoggedReps",
    "LOGGED_REPS_MAX",
    "formatWeightLbs",
    "isScheduledDeloadWeek",
    "scheduledDeloadLoad",
    "buildRecommendation",
    "evaluateReactive",
    "parseIsoDate",
    "isUuid",
    "MUSCLE_GROUPS",
    "EQUIPMENT_TYPES",
    "PLAN_CAPABILITIES",
    "RELEASE_NOTES",
    "TOUR_CONTENT",
    "ERROR_CODES",
  ];
  const files = walkCode().map((f) => ({ f, src: code(f) }));

  it.each(RULES)("%s", (name) => {
    const def = new RegExp(
      `^\\s*(export\\s+)?(async\\s+)?(function|const|let|var)\\s+${name}\\b`,
      "m",
    );
    const defs = files.filter((x) => def.test(x.src)).map((x) => x.f);
    expect(defs.map(relToWeb)).toHaveLength(1);
    expect(defs[0].startsWith(SHARED_SRC)).toBe(true);
  });

  it("no web code writes the weight or reps limit inline", () => {
    const offenders = walkTs(WEB_SRC)
      .filter((f) => /\b9_?999\.99\b|reps\s*>\s*1_?000\b/.test(code(f)))
      .map(relToWeb);
    expect(offenders).toEqual([]);
  });
});

describe("the shared package holds no access control or server code", () => {
  const shared = walkTs(SHARED_SRC).map((f) => ({ f, src: code(f) }));

  it("defines and calls no entitlement resolution, gate, or data access", () => {
    const forbidden =
      /\b(requireAccount|requireAccountForDataRights|resolveEntitlement|computeEntitlement|requireCapability|gatePlanned|gateOccurrence|gateSessionSummary|gateHistory|createAccountClient|account\.db|prisma|\$transaction)\b/;
    expect(
      shared.filter((x) => forbidden.test(x.src)).map((x) => relToWeb(x.f)),
    ).toEqual([]);
  });

  it("builds no route handler or HTTP response (the mobile API is 21c)", () => {
    const http =
      /\b(NextResponse|NextRequest|new Response\(|Request\b|fetch\(|Headers\b)/;
    expect(
      shared.filter((x) => http.test(x.src)).map((x) => relToWeb(x.f)),
    ).toEqual([]);
  });

  it("reads no environment variable except NODE_ENV", () => {
    const env = /process\.env\.(?!NODE_ENV\b)\w+|process\.env\[/;
    expect(
      shared.filter((x) => env.test(x.src)).map((x) => relToWeb(x.f)),
    ).toEqual([]);
  });
});
