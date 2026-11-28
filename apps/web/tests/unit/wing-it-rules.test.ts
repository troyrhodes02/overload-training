import { isAllowedOpenEndedSetNumber } from "@overload/shared/logging/wing-it";

/**
 * Pitch 25: the open-ended set rule both clients pre-check and the server
 * applies. Sequential from 1, no gaps, no cap (owner decision at acceptance).
 */
describe("isAllowedOpenEndedSetNumber", () => {
  it("the next number after the logged ones, at any count", () => {
    expect(isAllowedOpenEndedSetNumber(1, [])).toBe(true);
    expect(isAllowedOpenEndedSetNumber(2, [1])).toBe(true);
    const many = Array.from({ length: 40 }, (_, i) => i + 1);
    expect(isAllowedOpenEndedSetNumber(41, many)).toBe(true);
  });

  it("a replay of a logged number is allowed (the server decides identical or conflict)", () => {
    expect(isAllowedOpenEndedSetNumber(1, [1, 2])).toBe(true);
  });

  it("refuses a gap, zero, negatives, and fractions", () => {
    expect(isAllowedOpenEndedSetNumber(3, [1])).toBe(false);
    expect(isAllowedOpenEndedSetNumber(0, [])).toBe(false);
    expect(isAllowedOpenEndedSetNumber(-1, [])).toBe(false);
    expect(isAllowedOpenEndedSetNumber(1.5, [])).toBe(false);
  });
});
