import { matchExercise, normalizeName } from "@/lib/import/match/matcher";

/**
 * Workout Plan Import & Review (OVE-106) — the deterministic library matcher
 * (spec §14.7). Offline: candidates are passed in. Proves exact/alias/fuzzy →
 * matched, ties → ambiguous candidates, no-hit → unknown, and that a
 * model-produced id is never trusted (the matcher only ever returns ids from the
 * candidate list).
 */

const LIB = [
  { id: "id-bench", name: "Barbell Bench Press" },
  { id: "id-incline", name: "Incline Barbell Bench Press" },
  { id: "id-row-bb", name: "Bent-Over Barbell Row" },
  { id: "id-row-cs", name: "Chest-Supported Row" },
  { id: "id-ohp", name: "Overhead Press" },
  { id: "id-squat", name: "Barbell Squat" },
  { id: "id-curl", name: "Dumbbell Curl" },
];

describe("normalizeName", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeName("  Barbell   Bench-Press!! ").text).toBe(
      "barbell bench press",
    );
  });
  it("expands a small alias set", () => {
    expect(normalizeName("BB Bench Press").text).toContain("barbell");
    expect(normalizeName("OHP").text).toBe("overhead press");
  });
});

describe("matchExercise", () => {
  it("exact (normalized) name → matched", () => {
    const r = matchExercise("barbell bench press", LIB);
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") expect(r.exerciseId).toBe("id-bench");
  });

  it("alias/abbreviation resolves → matched", () => {
    const r = matchExercise("BB Bench Press", LIB);
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") expect(r.exerciseId).toBe("id-bench");
  });

  it("a bounded-fuzzy single best → matched", () => {
    const r = matchExercise("Overhead Pressing", LIB);
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") expect(r.exerciseId).toBe("id-ohp");
  });

  it("a genuine tie → ambiguous with candidates", () => {
    const r = matchExercise("Row", LIB);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      const ids = r.candidates.map((c) => c.exerciseId);
      expect(ids).toEqual(expect.arrayContaining(["id-row-bb", "id-row-cs"]));
    }
  });

  it("no plausible hit → unknown (custom path only)", () => {
    const r = matchExercise("Face-pull cable thing", LIB);
    expect(r.kind).toBe("unknown");
  });

  it("empty / whitespace name → unknown", () => {
    expect(matchExercise("   ", LIB).kind).toBe("unknown");
  });

  it("every returned id comes from the candidate list (never invented)", () => {
    const allIds = new Set(LIB.map((c) => c.id));
    for (const raw of ["bench", "row", "squat", "unknown xyz", "ohp"]) {
      const r = matchExercise(raw, LIB);
      if (r.kind === "matched") expect(allIds.has(r.exerciseId)).toBe(true);
      if (r.kind === "ambiguous") {
        for (const c of r.candidates)
          expect(allIds.has(c.exerciseId)).toBe(true);
      }
    }
  });
});
