import {
  bestWorkingSet,
  estimateOneRepMax,
  sessionE1rm,
} from "@/lib/progression/e1rm";

describe("estimateOneRepMax (Epley, R17)", () => {
  it("returns the weight exactly for a single rep", () => {
    expect(estimateOneRepMax(225, 1)).toBe(225);
    expect(estimateOneRepMax(100.5, 1)).toBe(100.5);
  });

  it("applies weight × (1 + reps / 30) for multi-rep sets", () => {
    expect(estimateOneRepMax(185, 8)).toBeCloseTo(185 * (1 + 8 / 30), 6);
    expect(estimateOneRepMax(185, 8)).toBeCloseTo(234.333, 3);
    expect(estimateOneRepMax(135, 5)).toBeCloseTo(157.5, 6);
  });

  it("does not special-case high reps (one formula only)", () => {
    expect(estimateOneRepMax(100, 20)).toBeCloseTo(100 * (1 + 20 / 30), 6);
  });
});

describe("sessionE1rm — max working-set e1RM (R18)", () => {
  it("uses the single strongest working set, not the average", () => {
    const point = sessionE1rm([
      { weightLbs: 185, reps: 8 }, // 234.33
      { weightLbs: 185, reps: 7 }, // 228.17
      { weightLbs: 175, reps: 8 }, // 221.67
    ]);
    expect(point).toBeCloseTo(estimateOneRepMax(185, 8), 6);
  });

  it("changing which set is strongest changes the point", () => {
    const before = sessionE1rm([
      { weightLbs: 185, reps: 8 },
      { weightLbs: 185, reps: 7 },
    ]);
    const after = sessionE1rm([
      { weightLbs: 185, reps: 8 },
      { weightLbs: 205, reps: 8 }, // now the strongest
    ]);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo(estimateOneRepMax(205, 8), 6);
  });

  it("returns 0 for an empty set list (defensive)", () => {
    expect(sessionE1rm([])).toBe(0);
  });
});

describe("bestWorkingSet — the set behind the session e1RM (Pitch 6 reuse)", () => {
  it("returns the working set with the highest canonical estimate", () => {
    const sets = [
      { weightLbs: 185, reps: 8 }, // 234.33
      { weightLbs: 205, reps: 5 }, // 239.17
      { weightLbs: 225, reps: 1 }, // 225
    ];
    expect(bestWorkingSet(sets)).toBe(sets[1]);
    expect(sessionE1rm(sets)).toBeCloseTo(estimateOneRepMax(205, 5), 9);
  });

  it("keeps the earlier set on a tie and returns null for no sets", () => {
    const sets = [
      { weightLbs: 200, reps: 3 },
      { weightLbs: 200, reps: 3 },
    ];
    expect(bestWorkingSet(sets)).toBe(sets[0]);
    expect(bestWorkingSet([])).toBeNull();
  });
});
