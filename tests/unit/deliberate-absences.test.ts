import fs from "node:fs";
import path from "node:path";

/**
 * Library & Gyms Setup — deliberate absences. This feature builds the exercise
 * catalog and gym directory ONLY. These guards prove nothing from later
 * pitches or the permanent non-goals slipped in.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(REPO_ROOT, "src");

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = walk(SRC).map((f) => ({
  rel: path.relative(REPO_ROOT, f).replace(/\\/g, "/"),
  src: fs.readFileSync(f, "utf8"),
}));

function offenders(re: RegExp): string[] {
  return files.filter((f) => re.test(f.src)).map((f) => f.rel);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const schema = fs.readFileSync(
  path.join(REPO_ROOT, "prisma", "schema.prisma"),
  "utf8",
);

describe("no workout logging, plan building, or progression", () => {
  it("writes no logged-history, plan, baseline, goal, or cardio rows", () => {
    expect(
      offenders(
        /\.\s*(loggedSession|loggedExercise|loggedSet|mesocycle|session|sessionExercise|gymExerciseBaseline|goal|cardioLog)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
      ),
    ).toEqual([]);
  });

  it("has no baseline correction, gym-variable rule, progression, e1RM, or swap code", () => {
    expect(
      offenders(
        /\b(isGymVariable|applyBaselineCorrection|estimateOneRepMax|progressionTag|e1rm|swapExercise|resolveMissedDay|logSet)\b/i,
      ),
    ).toEqual([]);
  });

  it("has no logging, history, plan, or goal routes", () => {
    const appDir = path.join(SRC, "app", "(app)");
    const routes = fs
      .readdirSync(appDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(routes).toEqual(["exercises", "gyms"]);
  });
});

describe("no maps, geocoding, or location intelligence", () => {
  it("adds no map/geocoding dependency", () => {
    const mapLike =
      /(leaflet|mapbox|maplibre|google-?maps|react-map-gl|@vis\.gl|geocod|opencage|here-maps|turf|geolib|openlayers|^ol$)/i;
    expect(deps.filter((d) => mapLike.test(d))).toEqual([]);
  });

  it("uses no geolocation API, coordinates, or map links", () => {
    expect(
      offenders(
        /navigator\.geolocation|\b(latitude|longitude|geocode)\b|maps\.google|google\.com\/maps|openstreetmap|maps\.apple/i,
      ),
    ).toEqual([]);
  });

  it("stores no coordinates in the schema", () => {
    expect(schema).not.toMatch(
      /\b(latitude|longitude|lat|lng|geo\w*|coordinates?)\b/i,
    );
  });
});

describe("no automatic personalization or recommendations", () => {
  it("has no recently-used, most-used, suggestion, or recommendation code", () => {
    expect(
      offenders(
        /recently.?used|most.?used|recommend|suggest(ed)?Exercises?|autoFavorite/i,
      ),
    ).toEqual([]);
  });

  it("never writes a favorite except from the lifter's explicit toggle", () => {
    // A hardcoded `data: { isFavorite: true }` would be automatic favoriting.
    expect(offenders(/data\s*:\s*\{[^}]*isFavorite\s*:\s*true/)).toEqual([]);
    // The only favorite write takes its value from the caller (the toggle).
    expect(offenders(/data\s*:\s*\{[^}]*isFavorite\s*:/)).toEqual([
      "src/lib/exercises/exercises.ts",
    ]);
  });
});

describe("no user image upload path", () => {
  it("has no file inputs, Storage client use, or uploads in application code", () => {
    expect(
      offenders(/type=["']file["']|\.upload\s*\(|\.storage\b|createBucket/),
    ).toEqual([]);
  });
});
