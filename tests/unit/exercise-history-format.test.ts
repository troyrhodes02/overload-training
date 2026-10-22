import {
  exerciseHistoryHref,
  formatLoad,
  formatRirLine,
  formatSetLine,
} from "@/lib/progression/history-format";

/** How a session's sets print on the exercise history (spec §13). */
describe("formatSetLine", () => {
  const set = (weightLbs: number | null, reps: number) => ({ weightLbs, reps });

  it("one load for every working set", () => {
    expect(
      formatSetLine(
        {
          workingSets: [set(185, 10), set(185, 10), set(185, 9)],
          extraSets: [],
        },
        true,
      ),
    ).toBe("185 × 10 · 10 · 9");
  });

  it("a load that changes is printed per set", () => {
    expect(
      formatSetLine(
        { workingSets: [set(185, 8), set(190, 7), set(190, 6)], extraSets: [] },
        true,
      ),
    ).toBe("185 × 8 · 190 × 7 · 190 × 6");
  });

  it("extra sets follow a plus; half pounds keep their half", () => {
    expect(
      formatSetLine(
        {
          workingSets: [set(102.5, 10), set(102.5, 10)],
          extraSets: [set(135, 15)],
        },
        true,
      ),
    ).toBe("102.5 × 10 · 10 + 135 × 15");
  });

  it("reps-only lifts never print a load", () => {
    expect(
      formatSetLine(
        { workingSets: [set(null, 20), set(null, 20)], extraSets: [] },
        false,
      ),
    ).toBe("20 · 20 reps");
    expect(
      formatSetLine(
        {
          workingSets: [set(null, 20), set(null, 18)],
          extraSets: [set(null, 15)],
        },
        false,
      ),
    ).toBe("20 · 18 + 15 reps");
  });
});

describe("formatRirLine", () => {
  it("prints recorded RIR, '–' for an unrecorded set, 4+ for the top", () => {
    expect(formatRirLine([{ rir: 2 }, { rir: null }, { rir: 4 }])).toBe(
      "RIR 2 · – · 4+",
    );
  });
  it("is null when nothing was recorded (never shown as 0)", () => {
    expect(formatRirLine([{ rir: null }, { rir: null }])).toBeNull();
  });
});

describe("formatLoad / exerciseHistoryHref", () => {
  it("drops float noise only", () => {
    expect(formatLoad(185)).toBe("185");
    expect(formatLoad(102.5)).toBe("102.5");
    expect(formatLoad(0.1 + 0.2)).toBe("0.3");
  });
  it("a machine opens on its gym; anything else needs none", () => {
    expect(exerciseHistoryHref("ex")).toBe("/exercises/ex");
    expect(exerciseHistoryHref("ex", "gym")).toBe("/exercises/ex?gym=gym");
  });
});
