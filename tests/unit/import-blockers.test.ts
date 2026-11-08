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

  it("two matched exercises in one day resolving to the SAME library id block (unconfirmable duplicate)", () => {
    const d = draft();
    // Add a second exercise in the same day pointing at the same library row —
    // this would collide on SessionExercise's @@unique([sessionId, exerciseId]).
    d.days[0].exercises.push({
      key: "d0e1",
      match: { kind: "matched", exerciseId: "lib-1", name: "Bench" },
      sets: { value: 3, raw: "3", status: "explicit", evidence: null },
      repMin: { value: 8, raw: "8", status: "explicit", evidence: null },
      repMax: { value: 10, raw: "10", status: "explicit", evidence: null },
      context: [],
    });
    const blockers = deriveBlockers(d);
    expect(blockers.some((b) => b.code === "DUPLICATE_EXERCISE_IN_DAY")).toBe(
      true,
    );
    // The blocker is anchored to the SECOND (duplicate) exercise's match.
    expect(
      blockers.some(
        (b) =>
          b.code === "DUPLICATE_EXERCISE_IN_DAY" &&
          b.fieldPath === "/days/0/exercises/1/match",
      ),
    ).toBe(true);
  });

  it("the SAME library id across DIFFERENT days is fine (no duplicate blocker)", () => {
    const d = draft();
    d.days.push({
      key: "d1",
      label: { value: "Pull", raw: "Pull", status: "explicit", evidence: null },
      exercises: [
        {
          key: "d1e0",
          match: { kind: "matched", exerciseId: "lib-1", name: "Bench" },
          sets: { value: 3, raw: "3", status: "explicit", evidence: null },
          repMin: { value: 6, raw: "6", status: "explicit", evidence: null },
          repMax: { value: 8, raw: "8", status: "explicit", evidence: null },
          context: [],
        },
      ],
    });
    expect(
      deriveBlockers(d).some((b) => b.code === "DUPLICATE_EXERCISE_IN_DAY"),
    ).toBe(false);
  });

  it("two custom_staged exercises in one day never duplicate-block (each mints a fresh id)", () => {
    const d = draft();
    d.days[0].exercises[0].match = {
      kind: "custom_staged",
      name: "Thing",
      primaryMuscle: "chest",
      equipmentType: "barbell",
    };
    d.days[0].exercises.push({
      key: "d0e1",
      match: {
        kind: "custom_staged",
        name: "Thing",
        primaryMuscle: "chest",
        equipmentType: "barbell",
      },
      sets: { value: 3, raw: "3", status: "explicit", evidence: null },
      repMin: { value: 6, raw: "6", status: "explicit", evidence: null },
      repMax: { value: 8, raw: "8", status: "explicit", evidence: null },
      context: [],
    });
    expect(
      deriveBlockers(d).some((b) => b.code === "DUPLICATE_EXERCISE_IN_DAY"),
    ).toBe(false);
  });
});
