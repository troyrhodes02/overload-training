/**
 * Pitch 21g correction OVE-229: the shared rule both cards use to say how the
 * weight box relates to the call. It never makes a number: the suggestion is
 * the server's (null on Free), the offer is the existing offer rule's.
 */
import type { Offer } from "@overload/shared/logging/set-entry";
import {
  NOT_ADJUSTED_CAPTION,
  weightGuidance,
  type WeightGuidanceInput,
} from "@overload/shared/logging/weight-guidance";

const lastTime: Offer = {
  weightLbs: 180,
  source: { kind: "working_weight", fromBaseline: false },
};
const sameAsSet1: Offer = {
  weightLbs: 185,
  source: { kind: "previous_set", setNumber: 1 },
};
const g = (over: Partial<WeightGuidanceInput>) =>
  weightGuidance({
    offer: lastTime,
    typed: null,
    callKind: null,
    suggestedLbs: null,
    externalLoad: true,
    anySaved: false,
    ...over,
  });

describe("the caption", () => {
  it("Progress over last time's 180: not adjusted, and Use 185 lb", () => {
    expect(g({ callKind: "progress", suggestedLbs: 185 })).toEqual({
      caption: NOT_ADJUSTED_CAPTION,
      use: { lbs: 185, label: "Use 185 lb" },
    });
  });
  it("a reactive Deload (no number): not adjusted, and no action", () => {
    expect(g({ callKind: "deload" })).toEqual({
      caption: NOT_ADJUSTED_CAPTION,
      use: null,
    });
    expect(g({ callKind: "reassess" }).caption).toBe(NOT_ADJUSTED_CAPTION);
  });
  it("a hold, no call, or Free: the plain source caption", () => {
    expect(g({ callKind: "hold" }).caption).toBe("last time");
    expect(g({}).caption).toBe("last time");
  });
  it("the box already holds the suggestion: plain caption, no action", () => {
    expect(
      g({
        callKind: "progress",
        suggestedLbs: 180,
      }),
    ).toEqual({ caption: "last time", use: null });
  });
  it("same as set N stays as it is (a choice made today)", () => {
    expect(
      g({ offer: sameAsSet1, callKind: "progress", suggestedLbs: 190 }).caption,
    ).toBe("same as set 1");
  });
  it("a typed value has no caption", () => {
    expect(g({ typed: "175", callKind: "deload" }).caption).toBeNull();
  });
  it("nothing offered (no history, reference only, first deload week): no caption", () => {
    expect(g({ offer: null, callKind: "deload" }).caption).toBeNull();
  });
});

describe("the one-tap action", () => {
  it("Deload week with an empty box: Use 160 lb", () => {
    expect(
      g({ offer: null, callKind: "scheduled_deload", suggestedLbs: 160 }).use,
    ).toEqual({ lbs: 160, label: "Use 160 lb" });
  });
  it("over a typed weight it says what it replaces", () => {
    expect(
      g({ typed: "175", callKind: "progress", suggestedLbs: 185 }).use,
    ).toEqual({ lbs: 185, label: "Replace 175 with 185 lb" });
    expect(
      g({ typed: "185", callKind: "progress", suggestedLbs: 185 }).use,
    ).toBeNull();
  });
  it("never after the first saved set, for bodyweight, without a number, or for a hold", () => {
    expect(
      g({ callKind: "progress", suggestedLbs: 185, anySaved: true }).use,
    ).toBeNull();
    expect(
      g({ callKind: "progress", suggestedLbs: 185, externalLoad: false }).use,
    ).toBeNull();
    expect(g({ callKind: "progress", suggestedLbs: null }).use).toBeNull();
    expect(g({ callKind: "hold", suggestedLbs: 185 }).use).toBeNull();
    expect(g({ callKind: "deload", suggestedLbs: 160 }).use).toBeNull();
  });
});
