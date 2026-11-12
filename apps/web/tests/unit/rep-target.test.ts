import {
  formatRepTarget,
  repModeFor,
  submittedReps,
  switchRepMode,
} from "@/lib/plan/rep-target";
import { parsePlannedExercise } from "@/lib/plan/validation";

/**
 * Workout Logging Refinements — single rep targets (spec §3.2, §7; RD-7). A
 * fixed target is a range with equal ends; the plan dialog's Range / Fixed
 * control only changes how it is typed, and nothing typed is lost.
 */
const v = (min: string, max: string) => ({
  plannedSets: "3",
  targetRepMin: min,
  targetRepMax: max,
});

describe("rep mode", () => {
  it("a saved prescription opens in Fixed only when its ends are equal", () => {
    expect(repModeFor(10, 10)).toBe("fixed");
    expect(repModeFor(8, 10)).toBe("range");
  });

  it("Range → Fixed keeps the minimum (or the maximum alone) as the target", () => {
    expect(switchRepMode(v("8", "10"), "fixed")).toEqual(v("8", "8"));
    expect(switchRepMode(v("", "12"), "fixed")).toEqual(v("12", "12"));
    expect(switchRepMode(v("", ""), "fixed")).toEqual(v("", ""));
  });

  it("Fixed → Range puts the target in both boxes", () => {
    expect(switchRepMode(v("10", "10"), "range")).toEqual(v("10", "10"));
    expect(switchRepMode(v("10", "14"), "range")).toEqual(v("10", "10"));
  });

  it("Fixed submits the target as both ends; Range submits what was typed", () => {
    expect(submittedReps(v("10", "12"), "fixed")).toEqual(v("10", "10"));
    expect(submittedReps(v("8", "10"), "range")).toEqual(v("8", "10"));
  });

  it("the unchanged server validation accepts a fixed target and refuses a bad one", () => {
    expect(parsePlannedExercise(submittedReps(v("10", ""), "fixed"))).toEqual({
      ok: true,
      value: { plannedSets: 3, targetRepMin: 10, targetRepMax: 10 },
    });
    const bad = parsePlannedExercise(submittedReps(v("0", ""), "fixed"));
    expect(bad.ok).toBe(false);
  });

  it("prints one number for a fixed target", () => {
    expect(formatRepTarget(10, 10)).toBe("10");
    expect(formatRepTarget(8, 10)).toBe("8–10");
  });
});
