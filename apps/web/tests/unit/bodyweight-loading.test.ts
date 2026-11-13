import fs from "node:fs";
import {
  loadingMode,
  requiresExternalWeight,
} from "@overload/shared/exercises/loading-mode";
import { isGymVariable } from "@overload/shared/exercises/gym-variable";
import { EQUIPMENT_TYPES } from "@overload/shared/exercises/taxonomy";
import { evaluateReactive, type Performance } from "@/lib/progression/engine";
import { loadedSets, sessionE1rm } from "@/lib/progression/e1rm";
import { libFile, relToWeb, walkCode } from "../support/code-roots";

/**
 * Bodyweight logging: the single loading-mode authority, and the pure engine /
 * e1RM behavior for reps-only (weight null) performances.
 */
describe("loading mode (requiresExternalWeight)", () => {
  it("bodyweight equipment is reps only", () => {
    expect(loadingMode({ equipmentType: "bodyweight" })).toBe("bodyweight");
    expect(requiresExternalWeight({ equipmentType: "bodyweight" })).toBe(false);
  });

  it("every other canonical equipment value requires an external weight", () => {
    const repsOnly = EQUIPMENT_TYPES.filter(
      (e) => !requiresExternalWeight({ equipmentType: e }),
    );
    expect(repsOnly).toEqual(["bodyweight"]);
  });

  it("`other` (how the catalog files Weighted Pull Ups / Weighted Bench Dip) stays external_load", () => {
    expect(loadingMode({ equipmentType: "other" })).toBe("external_load");
  });

  it("no gym-variable exercise is bodyweight (baselines always have a load)", () => {
    for (const e of EQUIPMENT_TYPES) {
      if (isGymVariable({ equipmentType: e })) {
        expect(requiresExternalWeight({ equipmentType: e })).toBe(true);
      }
    }
  });
});

describe("e1RM never sees a missing weight", () => {
  it("loadedSets drops reps-only sets instead of coercing null to 0", () => {
    const sets = [
      { weightLbs: null, reps: 15 },
      { weightLbs: 100, reps: 10 },
    ];
    expect(loadedSets(sets)).toEqual([{ weightLbs: 100, reps: 10 }]);
    expect(loadedSets([{ weightLbs: null, reps: 15 }])).toEqual([]);
    expect(sessionE1rm(loadedSets([{ weightLbs: null, reps: 15 }]))).toBe(0);
  });
});

let seq = 0;
beforeEach(() => {
  seq = 0;
});

/** A complete 2×6–12 pull-up performance, reps only. */
function pullUps(reps: number[], scheduledDeload = false): Performance {
  seq += 1;
  return {
    loggedExerciseId: `le-${seq}`,
    dateIso: `2026-11-${String(seq).padStart(2, "0")}`,
    week: seq,
    scheduledDeload,
    gymId: null,
    complete: true,
    finished: true,
    repMin: 6,
    repMax: 12,
    workingSets: reps.map((r, i) => ({
      setNumber: i + 1,
      weightLbs: null,
      reps: r,
      rir: null,
    })),
  };
}

const BW = { e1rmApplicable: false };

describe("engine bodyweight branch (e1rmApplicable: false)", () => {
  it("a first qualifying session alone is insufficient history", () => {
    expect(evaluateReactive([pullUps([15, 15])], BW)).toBe("insufficient");
  });

  it("two sessions at/above the top of 6–12 → progress", () => {
    expect(evaluateReactive([pullUps([15, 15]), pullUps([12, 13])], BW)).toBe(
      "progress",
    );
  });

  it("a full stall window still progresses: no e1RM gate on missing weight", () => {
    const perfs = [pullUps([15, 15]), pullUps([15, 15]), pullUps([15, 15])];
    expect(evaluateReactive(perfs, BW)).toBe("progress");
    // Without the branch the gate would compare 0 → 0 and wrongly stall.
    expect(evaluateReactive(perfs)).toBe("stalled");
  });

  it("falling short of the top is hold; below the minimum twice is deload", () => {
    expect(evaluateReactive([pullUps([15, 15]), pullUps([12, 10])], BW)).toBe(
      "hold",
    );
    expect(evaluateReactive([pullUps([5, 5]), pullUps([4, 6])], BW)).toBe(
      "deload",
    );
  });

  it("scheduled-deload performances are still excluded from the sequence", () => {
    expect(
      evaluateReactive([pullUps([15, 15]), pullUps([15, 15], true)], BW),
    ).toBe("insufficient");
  });
});

describe("one authority for loading mode (no scattered checks)", () => {
  it("only loading-mode.ts compares equipmentType to bodyweight", () => {
    // The web source and the shared package (Pitch 21b), where loading-mode
    // now lives.
    const authority = libFile("exercises/loading-mode.ts");
    const offenders = walkCode()
      .filter((f) => f !== authority)
      .filter((f) =>
        /equipmentType\s*[!=]==?\s*["']bodyweight["']/.test(
          fs.readFileSync(f, "utf8"),
        ),
      )
      .map(relToWeb);
    expect(offenders).toEqual([]);
  });
});
