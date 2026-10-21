import {
  RIR_MAX,
  RIR_VALUES,
  formatRir,
  isRir,
  rirAccessibleName,
  rirSpoken,
  rirSuffix,
} from "@/lib/logging/rir";
import { loggedRowLabel } from "@/lib/logging/set-entry";

/** The one RIR scale (RIR Logging & Autoregulation §11.1; R3, R4). */
describe("RIR scale", () => {
  it("is 0..4, where 4 stands for 4 or more", () => {
    expect(RIR_VALUES).toEqual([0, 1, 2, 3, 4]);
    expect(RIR_MAX).toBe(4);
  });

  it.each([0, 1, 2, 3, 4])("accepts %d", (v) => {
    expect(isRir(v)).toBe(true);
  });

  it.each([
    ["5", 5],
    ["-1", -1],
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a numeric string", "2"],
    ["null", null],
    ["undefined", undefined],
    ["a boolean", true],
  ])("rejects %s", (_l, v) => {
    expect(isRir(v)).toBe(false);
  });

  it("formats 4 as 4+ and every other value as itself", () => {
    expect(RIR_VALUES.map(formatRir)).toEqual(["0", "1", "2", "3", "4+"]);
  });

  it("shows a suffix only when RIR was recorded — 0 is shown, null is nothing", () => {
    expect(rirSuffix(null)).toBe("");
    expect(rirSuffix(0)).toBe("· 0 RIR");
    expect(rirSuffix(2)).toBe("· 2 RIR");
    expect(rirSuffix(4)).toBe("· 4+ RIR");
  });

  it("speaks a logged row's RIR through loggedRowLabel's detail, and nothing when unrecorded", () => {
    const set = { setNumber: 1, weightLbs: 185, reps: 8 };
    expect(loggedRowLabel(set, rirSpoken(2))).toBe(
      "Set 1, 185 pounds, 8 reps, 2 reps in reserve, logged. Correct this set",
    );
    expect(loggedRowLabel(set, rirSpoken(4))).toBe(
      "Set 1, 185 pounds, 8 reps, 4 or more reps in reserve, logged. Correct this set",
    );
    expect(loggedRowLabel(set, rirSpoken(null))).toBe(loggedRowLabel(set));
    expect(rirSpoken(0)).toBe("0 reps in reserve");
  });

  it("names 4 as '4 or more' for screen readers", () => {
    expect(rirAccessibleName(4)).toBe("4 or more");
    expect(rirAccessibleName(0)).toBe("0");
  });
});
