/**
 * Pitch 21k static guards (spec §7.4, §13; RD-E, RD-5, RD-L): what the tour
 * mechanism may call and where it may go, read from its source.
 */
import fs from "node:fs";
import path from "node:path";

const TOUR = path.resolve(__dirname, "..", "src", "tour");
const files = fs
  .readdirSync(TOUR)
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ name: f, code: fs.readFileSync(path.join(TOUR, f), "utf8") }));
const all = files.map((f) => f.code).join("\n");

describe("the tour's source", () => {
  it("talks to the API only through the two tour calls", () => {
    // No direct request, and no import of a training, schedule, goal, or
    // resource API module.
    expect(all).not.toMatch(/\.request\s*[<(]/);
    expect(all).not.toMatch(
      /from "\.\.\/api\/(training|schedule|goals|resources)"/,
    );
    const apiImports = [
      ...all.matchAll(/import \{([^}]+)\} from "\.\.\/api\/account"/g),
    ]
      .flatMap((m) => m[1].split(","))
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
    expect(apiImports).toEqual(["markTourOffered", "recordTourOutcome"]);
    const account = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "api", "account.ts"),
      "utf8",
    );
    for (const fn of ["recordTourOutcome", "markTourOffered"]) {
      const body = account.slice(account.indexOf(`export function ${fn}`));
      expect(body.slice(0, 400)).toMatch(/"\/me\/tour\/(outcome|offered)"/);
    }
  });

  it("navigates only with router.navigate to the five tab roots", () => {
    expect(all).not.toMatch(/router\.(push|replace|back|dismiss|setParams)/);
    const targets = [...all.matchAll(/router\.navigate\(([^)]+)\)/g)].map((m) =>
      m[1].trim(),
    );
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) expect(t).toMatch(/^(home|TOUR_TAB_PATHS\.more)$/);
    expect(all).toMatch(
      /today: "\/today",\s*history: "\/history",\s*plan: "\/plan",\s*goals: "\/goals",\s*more: "\/more",/,
    );
    expect(all).not.toMatch(/["'`]\/workout/);
  });

  it("adds no native dependency: only React Native, Expo Router, and app modules", () => {
    const external = new Set(
      [...all.matchAll(/from "([^.][^"]*)"/g)].map((m) => m[1]),
    );
    for (const mod of external) {
      expect([
        "react",
        "react-native",
        "expo-router",
        "react-native-safe-area-context",
        "@tanstack/react-query",
        "@overload/shared/tour/content",
      ]).toContain(mod);
    }
  });

  it("never stores a tour state on the device", () => {
    expect(all).not.toMatch(/SecureStore|AsyncStorage|expo-file-system/);
  });
});
