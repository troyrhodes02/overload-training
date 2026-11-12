import {
  parseScheme,
  parsePrescription,
  detectMixedUnits,
  capIssues,
  ISSUE_CODES,
} from "@/lib/import/parse/shorthand";

/**
 * Workout Plan Import & Review (OVE-106) — the pure shorthand parser (spec
 * §14.12). 100+ offline fixtures across every supported scheme plus the
 * invalid/contradictory cases. No DB, no network, no provider.
 */

describe("parseScheme — sets × reps", () => {
  const cases: Array<{
    raw: string;
    sets: number | null;
    repMin: number | null;
    repMax: number | null;
  }> = [
    { raw: "3x8", sets: 3, repMin: 8, repMax: 8 },
    { raw: "3X8", sets: 3, repMin: 8, repMax: 8 },
    { raw: "3 x 8", sets: 3, repMin: 8, repMax: 8 },
    { raw: "4×6-8", sets: 4, repMin: 6, repMax: 8 },
    { raw: "4×6–8", sets: 4, repMin: 6, repMax: 8 },
    { raw: "4x6to8", sets: 4, repMin: 6, repMax: 8 },
    { raw: "5*5", sets: 5, repMin: 5, repMax: 5 },
    { raw: "3x12", sets: 3, repMin: 12, repMax: 12 },
    { raw: "2x15", sets: 2, repMin: 15, repMax: 15 },
    { raw: "1x20", sets: 1, repMin: 20, repMax: 20 },
    { raw: "3x10-12", sets: 3, repMin: 10, repMax: 12 },
    { raw: "4 x 8 - 10", sets: 4, repMin: 8, repMax: 10 },
    { raw: "6x3", sets: 6, repMin: 3, repMax: 3 },
    { raw: "10x10", sets: 10, repMin: 10, repMax: 10 },
  ];
  it.each(cases)("$raw → $sets x $repMin-$repMax", (c) => {
    const r = parseScheme(c.raw);
    expect(r.sets.value).toBe(c.sets);
    expect(r.repMin.value).toBe(c.repMin);
    expect(r.repMax.value).toBe(c.repMax);
  });

  it("single value derives the max from the min", () => {
    const r = parseScheme("3x8");
    expect(r.repMin.status).toBe("explicit");
    expect(r.repMax.status).toBe("derived");
  });

  it("an explicit range keeps both bounds explicit", () => {
    const r = parseScheme("3x6-8");
    expect(r.repMin.status).toBe("explicit");
    expect(r.repMax.status).toBe("explicit");
  });
});

describe("AMRAP / to failure", () => {
  it.each(["3xAMRAP", "3 x amrap", "4x to failure", "2 x max reps"])(
    "%s → min 1, max missing, REQUIRED_MISSING",
    (raw) => {
      const r = parseScheme(raw);
      expect(r.repMin.value).toBe(1);
      expect(r.repMax.value).toBeNull();
      expect(r.issues).toContain(ISSUE_CODES.REQUIRED_MISSING);
    },
  );
});

describe("reps-only (no sets)", () => {
  it.each([
    { raw: "8", repMin: 8, repMax: 8 },
    { raw: "6-8", repMin: 6, repMax: 8 },
    { raw: "6–8", repMin: 6, repMax: 8 },
    { raw: "10 to 12", repMin: 10, repMax: 12 },
    { raw: "5", repMin: 5, repMax: 5 },
    { raw: "15", repMin: 15, repMax: 15 },
  ])("$raw → $repMin-$repMax, sets missing", (c) => {
    const r = parseScheme(c.raw);
    expect(r.sets.status).toBe("missing");
    expect(r.repMin.value).toBe(c.repMin);
    expect(r.repMax.value).toBe(c.repMax);
  });
});

describe("invalid / contradictory schemes", () => {
  it.each([
    "abc",
    "3x",
    "xreps",
    "3x8-6", // inverted range
    "0x5", // zero sets
    "3xfoo",
    "--",
    "3 x ?",
  ])("%s is flagged, not guessed", (raw) => {
    const r = parseScheme(raw);
    // Either sets or reps end up null/ambiguous — nothing is invented.
    const anyNull =
      r.sets.value === null ||
      r.repMin.value === null ||
      r.repMax.value === null;
    expect(anyNull).toBe(true);
  });

  it("an inverted range (8-6) is ambiguous, never silently swapped", () => {
    const r = parseScheme("3x8-6");
    expect(r.repMin.value).toBeNull();
    expect(r.repMax.value).toBeNull();
    expect(r.issues).toContain(ISSUE_CODES.VALUE_AMBIGUOUS);
  });

  it("sets over the cap are rejected (not clamped)", () => {
    const r = parseScheme("99x5");
    expect(r.sets.value).toBeNull();
    expect(r.sets.status).toBe("ambiguous");
  });
});

describe("units are preserved, never converted", () => {
  it("does not convert kg to lb or the reverse", () => {
    const p = parsePrescription({
      sets: "3",
      reps: "8",
      context: {
        load: "100 kg",
        rest: null,
        tempo: null,
        notes: null,
        groupLabel: null,
      },
    });
    // The load is shown verbatim as context, never turned into a plan field.
    expect(p.context.find((c) => c.label === "Load")?.value).toBe("100 kg");
  });

  it.each([
    { loads: ["100 lb", "50 kg"], mixed: true },
    { loads: ["100 lb", "135 lb"], mixed: false },
    { loads: ["60 kg", "70 kg"], mixed: false },
    { loads: [null, "bodyweight"], mixed: false },
    { loads: ["225#", "100 kg"], mixed: true },
  ])("detectMixedUnits($loads) = $mixed", (c) => {
    expect(detectMixedUnits(c.loads)).toBe(c.mixed);
  });
});

describe("parsePrescription — context & out-of-scope", () => {
  it("surfaces load/rest/tempo as read-only context and flags OUT_OF_SCOPE", () => {
    const p = parsePrescription({
      sets: "3",
      reps: "8",
      context: {
        load: "185 lb",
        rest: "2 min",
        tempo: "3-1-1",
        notes: "pause reps",
        groupLabel: "A1",
      },
    });
    const labels = p.context.map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Load", "Rest", "Tempo", "Superset", "Notes"]),
    );
    expect(p.issues).toContain(ISSUE_CODES.OUT_OF_SCOPE);
  });

  it("missing sets or reps is a blocking REQUIRED_MISSING", () => {
    const p = parsePrescription({
      sets: null,
      reps: "8",
      context: {
        load: null,
        rest: null,
        tempo: null,
        notes: null,
        groupLabel: null,
      },
    });
    expect(p.issues).toContain(ISSUE_CODES.REQUIRED_MISSING);
  });

  it("a clean prescription has no issues", () => {
    const p = parsePrescription({
      sets: "3",
      reps: "6-8",
      context: {
        load: null,
        rest: null,
        tempo: null,
        notes: null,
        groupLabel: null,
      },
    });
    expect(p.sets.value).toBe(3);
    expect(p.repMin.value).toBe(6);
    expect(p.repMax.value).toBe(8);
    expect(p.issues).toEqual([]);
  });
});

describe("structural caps (spec §12) are issues, never silent truncation", () => {
  it("too many days", () => {
    expect(
      capIssues({ dayCount: 15, exerciseCountsPerDay: [], setCounts: [] }),
    ).toContain(ISSUE_CODES.TOO_MANY_DAYS);
  });
  it("too many exercises in a day", () => {
    expect(
      capIssues({ dayCount: 1, exerciseCountsPerDay: [21], setCounts: [] }),
    ).toContain(ISSUE_CODES.TOO_MANY_EXERCISES);
  });
  it("too many sets", () => {
    expect(
      capIssues({ dayCount: 1, exerciseCountsPerDay: [1], setCounts: [16] }),
    ).toContain(ISSUE_CODES.TOO_MANY_SETS);
  });
  it("within caps → no issues", () => {
    expect(
      capIssues({ dayCount: 14, exerciseCountsPerDay: [20], setCounts: [15] }),
    ).toEqual([]);
  });
});

// A broad sweep to comfortably clear the 100-fixture floor: every sets 1..10 ×
// a representative rep set parses to the expected integers.
describe("broad sweep (offline fixtures)", () => {
  const repForms: Array<[string, number, number]> = [
    ["5", 5, 5],
    ["8", 8, 8],
    ["10", 10, 10],
    ["12", 12, 12],
    ["6-8", 6, 8],
    ["8-12", 8, 12],
    ["10-15", 10, 15],
  ];
  for (let sets = 1; sets <= 10; sets++) {
    for (const [reps, lo, hi] of repForms) {
      it(`${sets}x${reps}`, () => {
        const r = parseScheme(`${sets}x${reps}`);
        expect(r.sets.value).toBe(sets);
        expect(r.repMin.value).toBe(lo);
        expect(r.repMax.value).toBe(hi);
      });
    }
  }
});
