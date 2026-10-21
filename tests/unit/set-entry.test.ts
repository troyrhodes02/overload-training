import {
  activeSetNumber,
  formatPreviousPerformance,
  formatSetSummary,
  loggedRowLabel,
  offerCaption,
  offerFor,
  type CardSet,
} from "@/lib/logging/set-entry";
import { formatMonthDay } from "@/lib/plan/calendar";

/**
 * Faster Logging UX set-entry rules (spec §11.4, §14.1; R4–R7, R11–R12). Pure:
 * everything the card shows about which set is next and what weight it offers
 * comes from the server's records here, never from a stored or guessed value.
 */

const row = (
  setNumber: number,
  logged?: { w: number | null; r: number },
  extra = false,
): CardSet => ({
  setNumber,
  weightLbs: logged ? logged.w : null,
  reps: logged ? logged.r : null,
  saved: Boolean(logged),
  extra,
});

describe("activeSetNumber", () => {
  it("is the lowest planned set with no logged row", () => {
    expect(activeSetNumber([row(1), row(2), row(3)], 3, null)).toBe(1);
    expect(
      activeSetNumber([row(1, { w: 185, r: 8 }), row(2), row(3)], 3, null),
    ).toBe(2);
  });

  it("fills a gap left by a resumed workout before moving on", () => {
    expect(
      activeSetNumber(
        [row(1, { w: 185, r: 8 }), row(2), row(3, { w: 185, r: 7 })],
        3,
        null,
      ),
    ).toBe(2);
  });

  it("is none once the plan is logged, or the pending extra after Add set", () => {
    const done = [
      row(1, { w: 185, r: 8 }),
      row(2, { w: 185, r: 8 }),
      row(3, { w: 185, r: 7 }),
    ];
    expect(activeSetNumber(done, 3, null)).toBeNull();
    expect(activeSetNumber(done, 3, 4)).toBe(4);
    expect(
      activeSetNumber([...done, row(4, { w: 185, r: 6 }, true)], 3, 4),
    ).toBeNull();
  });
});

describe("offerFor", () => {
  it("never offers a weight to a bodyweight exercise", () => {
    expect(
      offerFor({
        requiresExternalWeight: false,
        sets: [row(1, { w: null, r: 18 }), row(2)],
        workingWeightLbs: null,
      }),
    ).toBeNull();
  });

  it("offers the working weight for the first set ('last time')", () => {
    const offer = offerFor({
      requiresExternalWeight: true,
      sets: [row(1), row(2), row(3)],
      workingWeightLbs: 185,
    });
    expect(offer).toEqual({
      weightLbs: 185,
      source: { kind: "working_weight" },
    });
    expect(offerCaption(offer!)).toBe("last time");
  });

  it("carries the most recently logged set's weight, not the original offer", () => {
    const offer = offerFor({
      requiresExternalWeight: true,
      sets: [row(1, { w: 190, r: 8 }), row(2), row(3)],
      workingWeightLbs: 185,
    });
    expect(offer).toEqual({
      weightLbs: 190,
      source: { kind: "previous_set", setNumber: 1 },
    });
    expect(offerCaption(offer!)).toBe("same as set 1");
    expect(
      offerFor({
        requiresExternalWeight: true,
        sets: [row(1, { w: 190, r: 8 }), row(2, { w: 195, r: 6 }), row(3)],
        workingWeightLbs: 185,
      }),
    ).toEqual({
      weightLbs: 195,
      source: { kind: "previous_set", setNumber: 2 },
    });
  });

  it("invents nothing when there is no weight context", () => {
    expect(
      offerFor({
        requiresExternalWeight: true,
        sets: [row(1), row(2)],
        workingWeightLbs: null,
      }),
    ).toBeNull();
  });
});

describe("formatSetSummary", () => {
  it("collapses one weight, lists changed weights, and prints bodyweight as reps", () => {
    const at = (w: number | null, r: number) => ({ weightLbs: w, reps: r });
    expect(formatSetSummary([at(185, 8), at(185, 8), at(185, 7)])).toBe(
      "185 × 8, 8, 7",
    );
    expect(formatSetSummary([at(185, 8), at(190, 6), at(190, 5)])).toBe(
      "185 × 8, 190 × 6, 190 × 5",
    );
    expect(formatSetSummary([at(null, 18), at(null, 15)])).toBe("18, 15 reps");
    expect(formatSetSummary([at(182.5, 8)])).toBe("182.5 × 8");
  });
});

describe("formatPreviousPerformance", () => {
  const sets = [
    { weightLbs: 185, reps: 8 },
    { weightLbs: 185, reps: 8 },
    { weightLbs: 185, reps: 7 },
  ];

  it("free weight: Last time · date · sets", () => {
    expect(
      formatPreviousPerformance({
        previous: { dateIso: "2026-10-13", gymScoped: false, sets },
        isGymVariable: false,
        gymName: null,
        referenceIso: "2026-10-20",
      }),
    ).toBe("Last time · Oct 13 · 185 × 8, 8, 7");
  });

  it("gym-variable: Last time here, and First time on this at <gym> when none", () => {
    expect(
      formatPreviousPerformance({
        previous: {
          dateIso: "2026-10-13",
          gymScoped: true,
          sets: [
            { weightLbs: 50, reps: 12 },
            { weightLbs: 50, reps: 12 },
            { weightLbs: 50, reps: 11 },
          ],
        },
        isGymVariable: true,
        gymName: "Downtown Gym",
        referenceIso: "2026-10-20",
      }),
    ).toBe("Last time here · Oct 13 · 50 × 12, 12, 11");
    expect(
      formatPreviousPerformance({
        previous: null,
        isGymVariable: true,
        gymName: "Campus Rec Center",
        referenceIso: "2026-10-20",
      }),
    ).toBe("First time on this at Campus Rec Center.");
  });

  it("no history: First time logging this.", () => {
    expect(
      formatPreviousPerformance({
        previous: null,
        isGymVariable: false,
        gymName: null,
        referenceIso: "2026-10-20",
      }),
    ).toBe("First time logging this.");
  });

  it("adds the year when the last time was in another year", () => {
    expect(
      formatPreviousPerformance({
        previous: { dateIso: "2025-12-29", gymScoped: false, sets },
        isGymVariable: false,
        gymName: null,
        referenceIso: "2026-01-05",
      }),
    ).toBe("Last time · Dec 29, 2025 · 185 × 8, 8, 7");
  });
});

describe("formatMonthDay / loggedRowLabel", () => {
  it("formats plan dates without a weekday", () => {
    expect(formatMonthDay("2026-10-13", "2026-10-20")).toBe("Oct 13");
    expect(formatMonthDay("2025-12-29", "2026-01-05")).toBe("Dec 29, 2025");
    expect(formatMonthDay("not-a-date", "2026-01-05")).toBe("not-a-date");
  });

  it("names a logged row's values for screen readers", () => {
    expect(loggedRowLabel({ setNumber: 1, weightLbs: 185, reps: 8 })).toBe(
      "Set 1, 185 pounds, 8 reps, logged. Correct this set",
    );
    expect(loggedRowLabel({ setNumber: 2, weightLbs: null, reps: 18 })).toBe(
      "Set 2, 18 reps, logged. Correct this set",
    );
  });
});
