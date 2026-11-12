import { estimateOneRepMax } from "@/lib/progression/e1rm";
import {
  bestPerformance,
  computeGoalProgress,
  displayPercent,
  formatGoalTarget,
  formatGoalTargetCompact,
  goalTargetE1rm,
  type GoalPerformance,
} from "@/lib/goals/progress";

/** A qualifying performance whose session e1RM comes from one working set. */
function perf(
  dateIso: string,
  weightLbs: number,
  reps: number,
): GoalPerformance {
  return {
    dateIso,
    e1rm: estimateOneRepMax(weightLbs, reps),
    bestSet: { weightLbs, reps },
  };
}

describe("goal target e1RM — the canonical estimator (R11, R12)", () => {
  it("a one-rep target equals the target weight", () => {
    expect(goalTargetE1rm(315, 1)).toBe(315);
  });

  it("a multi-rep target uses estimateOneRepMax exactly (Epley)", () => {
    expect(goalTargetE1rm(225, 12)).toBe(estimateOneRepMax(225, 12));
    expect(goalTargetE1rm(225, 12)).toBeCloseTo(315, 9);
    expect(goalTargetE1rm(200, 10)).toBeCloseTo(266.667, 3);
  });
});

describe("current best — best demonstrated, not latest (R13, R14, R53)", () => {
  it("selects the maximum session e1RM", () => {
    const best = bestPerformance([
      perf("2026-09-02", 225, 5), // 262.5
      perf("2026-09-30", 235, 5), // 274.2
      perf("2026-09-16", 230, 5), // 268.3
    ]);
    expect(best?.dateIso).toBe("2026-09-30");
  });

  it("a weaker newer session does not lower the best", () => {
    const p = computeGoalProgress({ targetWeightLbs: 315, targetReps: 1 }, [
      perf("2026-09-30", 235, 5), // 274.2 → 87%
      perf("2026-10-07", 215, 5), // 250.8 (fatigue)
    ]);
    expect(p.best?.dateIso).toBe("2026-09-30");
    expect(p.percent).toBe(87);
  });

  it("ties keep the earliest performance", () => {
    const best = bestPerformance([
      perf("2026-10-07", 200, 3),
      perf("2026-09-01", 200, 3),
    ]);
    expect(best?.dateIso).toBe("2026-09-01");
  });

  it("reports the set behind the best", () => {
    const p = computeGoalProgress({ targetWeightLbs: 315, targetReps: 1 }, [
      perf("2026-09-30", 235, 5),
    ]);
    expect(p.best).toEqual({
      e1rm: estimateOneRepMax(235, 5),
      weightLbs: 235,
      reps: 5,
      dateIso: "2026-09-30",
    });
  });
});

describe("no history is unmeasured, never 0% (R23)", () => {
  it("returns a null percent and ratio, and is never reached", () => {
    const p = computeGoalProgress({ targetWeightLbs: 315, targetReps: 1 }, []);
    expect(p.percent).toBeNull();
    expect(p.ratio).toBeNull();
    expect(p.best).toBeNull();
    expect(p.reached).toBe(false);
    expect(p.targetE1rm).toBe(315);
  });
});

describe("percentage — floored whole number, capped at 100 (R21, R22, R52)", () => {
  it("below target: correct ratio and floored percent", () => {
    const p = computeGoalProgress({ targetWeightLbs: 315, targetReps: 1 }, [
      perf("2026-09-30", 235, 5),
    ]);
    expect(p.ratio).toBeCloseTo(estimateOneRepMax(235, 5) / 315, 12);
    expect(p.percent).toBe(87);
    expect(p.reached).toBe(false);
  });

  it("exact target: 100% and reached", () => {
    const p = computeGoalProgress({ targetWeightLbs: 315, targetReps: 1 }, [
      perf("2026-10-12", 315, 1),
    ]);
    expect(p.percent).toBe(100);
    expect(p.reached).toBe(true);
  });

  it("identical multi-rep weight × reps on both sides counts as reached", () => {
    const p = computeGoalProgress({ targetWeightLbs: 225, targetReps: 12 }, [
      perf("2026-10-12", 225, 12),
    ]);
    expect(p.reached).toBe(true);
    expect(p.percent).toBe(100);
  });

  it("above target: capped at 100, reached, ratio stays precise", () => {
    const p = computeGoalProgress({ targetWeightLbs: 155, targetReps: 8 }, [
      perf("2026-10-12", 185, 8),
    ]);
    expect(p.percent).toBe(100);
    expect(p.ratio).toBeGreaterThan(1);
    expect(p.reached).toBe(true);
  });

  it("99.6% displays 99 — only a met target reads 100", () => {
    expect(displayPercent(0.996)).toBe(99);
    expect(displayPercent(0.99999)).toBe(99);
    const p = computeGoalProgress({ targetWeightLbs: 1000, targetReps: 1 }, [
      perf("2026-10-12", 996, 1),
    ]);
    expect(p.percent).toBe(99);
    expect(p.reached).toBe(false);
  });

  it("is float-stable (0.87 → 87, 0.29 → 29, never one below)", () => {
    expect(displayPercent(0.87)).toBe(87);
    expect(displayPercent(0.29)).toBe(29);
    expect(displayPercent(0.57)).toBe(57);
    expect(displayPercent(1.25)).toBe(100);
  });

  it("is deterministic: same inputs, same result", () => {
    const perfs = [perf("2026-09-30", 235, 5), perf("2026-10-05", 240, 4)];
    const a = computeGoalProgress(
      { targetWeightLbs: 315, targetReps: 1 },
      perfs,
    );
    const b = computeGoalProgress(
      { targetWeightLbs: 315, targetReps: 1 },
      perfs,
    );
    expect(a).toEqual(b);
  });
});

describe("target labels", () => {
  it("formats the lifter's own target", () => {
    expect(formatGoalTarget(315, 1)).toBe("315 lb × 1");
    expect(formatGoalTarget(102.5, 8)).toBe("102.5 lb × 8");
    expect(formatGoalTargetCompact(315, 1)).toBe("315 × 1");
  });
});
