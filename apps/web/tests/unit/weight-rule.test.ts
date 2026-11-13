import {
  checkWeightLbs,
  hasAtMostDecimals,
  WEIGHT_LBS_MAX,
  WEIGHT_MESSAGES,
} from "@overload/shared/logging/weight";
import { parseGoalInput } from "@overload/shared/goals/validation";

/** OVE-135 (mobile audit F-D3): one weight rule with named limits. */
describe("checkWeightLbs", () => {
  it.each([0.5, 1, 135, 185.25, 185.1, 2.5, WEIGHT_LBS_MAX])(
    "accepts %p",
    (w) => {
      expect(checkWeightLbs(w)).toEqual({ ok: true, value: w });
    },
  );

  it.each([
    [185.125, WEIGHT_MESSAGES.tooPrecise],
    [0.001, WEIGHT_MESSAGES.tooPrecise],
    [10000, WEIGHT_MESSAGES.tooLarge],
    [0, WEIGHT_MESSAGES.required],
    [-5, WEIGHT_MESSAGES.required],
    [Number.NaN, WEIGHT_MESSAGES.required],
    ["135", WEIGHT_MESSAGES.required],
  ])("refuses %p with its own message", (w, message) => {
    expect(checkWeightLbs(w)).toEqual({ ok: false, message });
  });

  it("tolerates binary floating-point noise", () => {
    expect(hasAtMostDecimals(0.1 + 0.2, 2)).toBe(true);
    expect(hasAtMostDecimals(185.1, 2)).toBe(true);
  });
});

describe("goal targets use the same rule", () => {
  const base = { exerciseId: "x", targetReps: "5" };
  it("refuses a target with three decimal places, specifically", () => {
    expect(parseGoalInput({ ...base, targetWeightLbs: "225.125" })).toEqual({
      ok: false,
      details: { targetWeightLbs: WEIGHT_MESSAGES.tooPrecise },
    });
  });
  it("accepts two decimal places", () => {
    expect(
      parseGoalInput({ ...base, targetWeightLbs: "225.25" }),
    ).toMatchObject({ ok: true, value: { targetWeightLbs: 225.25 } });
  });
});
