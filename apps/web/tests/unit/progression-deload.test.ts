import {
  isScheduledDeloadWeek,
  scheduledDeloadLoad,
} from "@/lib/progression/deload";

describe("isScheduledDeloadWeek (R33, R41)", () => {
  it("fires on every Nth week (weeks N, 2N, 3N…)", () => {
    expect(isScheduledDeloadWeek(5, 5)).toBe(true);
    expect(isScheduledDeloadWeek(10, 5)).toBe(true);
    expect(isScheduledDeloadWeek(4, 5)).toBe(false);
    expect(isScheduledDeloadWeek(6, 5)).toBe(false);
  });
  it("is false for a zero or absent cadence, or a pre-start week", () => {
    expect(isScheduledDeloadWeek(5, 0)).toBe(false);
    expect(isScheduledDeloadWeek(0, 5)).toBe(false);
    expect(isScheduledDeloadWeek(-1, 5)).toBe(false);
  });
});

describe("scheduledDeloadLoad — 90% rounded down to 5 lb (R35)", () => {
  it("rounds down to the nearest 5 and never above the raw 90% target", () => {
    expect(scheduledDeloadLoad(200)).toBe(180); // 180.0
    expect(scheduledDeloadLoad(185)).toBe(165); // 166.5 → 165
    expect(scheduledDeloadLoad(100)).toBe(90); //  90.0
  });
  it("the result is always <= raw 90%", () => {
    for (const base of [135, 142.5, 167, 225, 315]) {
      expect(scheduledDeloadLoad(base)).toBeLessThanOrEqual(base * 0.9);
    }
  });
});
