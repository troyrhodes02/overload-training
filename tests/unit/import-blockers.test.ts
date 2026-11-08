import { deriveBlockers } from "@/lib/import/draft/build";
import type { ImportDraft } from "@/lib/import/draft/types";

/**
 * Workout Plan Import & Review (OVE-106) — server-side blocker re-derivation
 * (spec §8 derived fields). This is the authority the confirm adapter re-runs; a
 * client "resolved" flag can never waive it. Proves that every unresolved field
 * blocks and a fully-resolved draft clears.
 */

function draft(over: Partial<ImportDraft> = {}): ImportDraft {
  return {
    version: 0,
    title: { value: "Plan", raw: "Plan", status: "explicit", evidence: null },
    days: [
      {
        key: "d0",
        label: {
          value: "Push",
          raw: "Push",
          status: "explicit",
          evidence: null,
        },
        exercises: [
          {
            key: "d0e0",
            match: { kind: "matched", exerciseId: "lib-1", name: "Bench" },
            sets: { value: 3, raw: "3", status: "explicit", evidence: null },
            repMin: { value: 6, raw: "6", status: "explicit", evidence: null },
            repMax: { value: 8, raw: "8", status: "explicit", evidence: null },
            context: [],
          },
        ],
      },
    ],
    issues: [],
    ...over,
  };
}

describe("deriveBlockers", () => {
  it("a fully resolved draft has no blockers", () => {
    expect(deriveBlockers(draft())).toEqual([]);
  });

  it("an ambiguous match blocks", () => {
    const d = draft();
    d.days[0].exercises[0].match = {
      kind: "ambiguous",
      raw: "Row",
      candidates: [{ exerciseId: "a", name: "A" }],
    };
    expect(deriveBlockers(d).some((b) => b.fieldPath.endsWith("/match"))).toBe(
      true,
    );
  });

  it("an unknown match blocks until staged custom", () => {
    const d = draft();
    d.days[0].exercises[0].match = { kind: "unknown", raw: "X" };
    expect(deriveBlockers(d).length).toBeGreaterThan(0);
    d.days[0].exercises[0].match = {
      kind: "custom_staged",
      name: "X",
      primaryMuscle: "chest",
      equipmentType: "barbell",
    };
    expect(deriveBlockers(d)).toEqual([]);
  });

  it("a missing day label blocks", () => {
    const d = draft();
    d.days[0].label.value = "";
    expect(deriveBlockers(d).some((b) => b.fieldPath.endsWith("/label"))).toBe(
      true,
    );
  });

  it("missing sets / rep bounds block", () => {
    const d = draft();
    d.days[0].exercises[0].sets.value = null;
    expect(deriveBlockers(d).some((b) => b.fieldPath.endsWith("/sets"))).toBe(
      true,
    );
  });

  it("rep min > rep max blocks", () => {
    const d = draft();
    d.days[0].exercises[0].repMin.value = 10;
    d.days[0].exercises[0].repMax.value = 6;
    expect(
      deriveBlockers(d).some((b) => b.fieldPath.endsWith("/repRange")),
    ).toBe(true);
  });

  it("no days blocks", () => {
    expect(
      deriveBlockers(draft({ days: [] })).some((b) => b.fieldPath === "/days"),
    ).toBe(true);
  });

  it("out-of-range sets block (not clamped)", () => {
    const d = draft();
    d.days[0].exercises[0].sets.value = 99;
    expect(deriveBlockers(d).some((b) => b.fieldPath.endsWith("/sets"))).toBe(
      true,
    );
  });
});
