import {
  PRESET_STRUCTURES,
  SPLIT_TYPES,
  SPLIT_TYPE_LABELS,
} from "@/lib/plan/presets";
import {
  addDays,
  cloneDefaultStartDate,
  formatPlanDate,
  formatPlanRange,
  mesocycleWeekForDate,
  parseIsoDate,
  plannedEndDate,
} from "@/lib/plan/calendar";
import {
  DEFAULT_DELOAD_WEEK,
  DEFAULT_LENGTH_WEEKS,
  deloadOutOfRangeMessage,
  parseDayOfWeek,
  parseMesocycleDetails,
  parsePlannedExercise,
  parseWholeNumber,
} from "@/lib/plan/validation";
import fs from "node:fs";
import path from "node:path";

const names = (t: keyof typeof PRESET_STRUCTURES) =>
  Array.from(
    { length: 7 },
    (_, i) =>
      PRESET_STRUCTURES[t].find((s) => s.dayOfWeek === i + 1)?.name ?? null,
  );

describe("preset structures (spec D8–D11)", () => {
  it("Push / Pull / Legs is exactly the approved week", () => {
    expect(names("ppl")).toEqual([
      "Push Day 1",
      "Pull Day 1",
      "Leg Day 1",
      "Push Day 2",
      "Pull Day 2",
      "Leg Day 2",
      null,
    ]);
  });

  it("Arnold is exactly the approved week", () => {
    expect(names("arnold")).toEqual([
      "Chest & Back 1",
      "Shoulders & Arms 1",
      "Legs 1",
      "Chest & Back 2",
      "Shoulders & Arms 2",
      "Legs 2",
      null,
    ]);
  });

  it("Bro Split is exactly the approved week", () => {
    expect(names("bro")).toEqual([
      "Chest",
      "Back",
      "Shoulders",
      "Legs",
      "Arms",
      null,
      null,
    ]);
  });

  it("Custom is an empty week", () => {
    expect(PRESET_STRUCTURES.custom).toEqual([]);
  });

  it("a preset slot is a day and a name — nothing else (no programming)", () => {
    for (const type of SPLIT_TYPES) {
      for (const slot of PRESET_STRUCTURES[type]) {
        expect(Object.keys(slot).sort()).toEqual(["dayOfWeek", "name"]);
      }
    }
    const src = fs
      .readFileSync(
        path.join(__dirname, "..", "..", "src", "lib", "plan", "presets.ts"),
        "utf8",
      )
      // Code only: the module comment explains what presets must NOT contain.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // No exercise, set, rep, or weight data can hide in the preset module.
    expect(src).not.toMatch(
      /exercise(Id)?\s*:|plannedSets|targetRep|weight|Bench|Squat|Pulldown/i,
    );
  });

  it("labels every split type", () => {
    expect(SPLIT_TYPE_LABELS).toEqual({
      ppl: "Push / Pull / Legs",
      arnold: "Arnold Split",
      bro: "Bro Split",
      custom: "Custom",
    });
  });
});

describe("calendar semantics (spec D59)", () => {
  it("rejects non-dates", () => {
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-2-3")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("2026-11-02")?.toISOString()).toBe(
      "2026-11-02T00:00:00.000Z",
    );
  });

  it("computes the planned end and the clone start (end + 1 day)", () => {
    expect(plannedEndDate("2026-09-28", 5)).toBe("2026-11-01");
    expect(cloneDefaultStartDate("2026-09-28", 5)).toBe("2026-11-02");
    expect(cloneDefaultStartDate(null, 5)).toBeNull();
    // Across a DST change and a year boundary, still pure calendar days.
    expect(plannedEndDate("2026-12-28", 1)).toBe("2027-01-03");
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
  });

  it("anchors weeks at the start date whatever its weekday", () => {
    // 2026-11-04 is a Wednesday: week 1 runs Wed–Tue.
    expect(mesocycleWeekForDate("2026-11-04", "2026-11-03")).toBeNull();
    expect(mesocycleWeekForDate("2026-11-04", "2026-11-04")).toBe(1);
    expect(mesocycleWeekForDate("2026-11-04", "2026-11-10")).toBe(1);
    expect(mesocycleWeekForDate("2026-11-04", "2026-11-11")).toBe(2);
    expect(mesocycleWeekForDate("2026-11-04", "2026-12-08")).toBe(5);
    expect(mesocycleWeekForDate("2026-11-04", "2026-12-09")).toBe(6);
  });

  it("formats dates in UTC as the design doc writes them", () => {
    expect(formatPlanDate("2026-11-02")).toBe("Mon, Nov 2");
    expect(formatPlanRange("2026-09-28", "2026-11-01")).toBe(
      "Mon, Sep 28 – Sun, Nov 1",
    );
  });
});

describe("plan validation (spec Validation Rules)", () => {
  it("the 5 / 5 pre-fill is a default, not a rule", () => {
    expect([DEFAULT_LENGTH_WEEKS, DEFAULT_DELOAD_WEEK]).toEqual([5, 5]);
    const other = parseMesocycleDetails({
      name: "Strength Block",
      lengthWeeks: "6",
      deloadWeek: "3",
    });
    expect(other).toEqual({
      ok: true,
      value: {
        name: "Strength Block",
        startDate: null,
        lengthWeeks: 6,
        deloadWeek: 3,
      },
    });
  });

  it("accepts whole numbers only", () => {
    expect(parseWholeNumber("3")).toBe(3);
    expect(parseWholeNumber(3)).toBe(3);
    for (const bad of ["", " ", "3.5", "-1", "1e2", "3x", 2.5, -1, null])
      expect(parseWholeNumber(bad)).toBeNull();
  });

  it("requires a name, a valid date if given, and positive whole weeks", () => {
    const r = parseMesocycleDetails({
      name: "  ",
      startDate: "2026-13-01",
      lengthWeeks: "0",
      deloadWeek: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.details).sort()).toEqual([
        "deloadWeek",
        "lengthWeeks",
        "name",
        "startDate",
      ]);
  });

  it("does not reject a deload week past the end — a draft may hold it", () => {
    const r = parseMesocycleDetails({
      name: "Strength Block",
      lengthWeeks: "4",
      deloadWeek: "5",
    });
    expect(r.ok).toBe(true);
    expect(deloadOutOfRangeMessage(5, 4)).toBe(
      "Week 5 is past the end of a 4-week block. Choose a week from 1 to 4.",
    );
    expect(deloadOutOfRangeMessage(4, 4)).toBeNull();
  });

  it("sets ≥ 1; reps ≥ 1; min ≤ max; equal valid; never swapped", () => {
    expect(
      parsePlannedExercise({
        plannedSets: "3",
        targetRepMin: "5",
        targetRepMax: "5",
      }),
    ).toEqual({
      ok: true,
      value: { plannedSets: 3, targetRepMin: 5, targetRepMax: 5 },
    });
    const swapped = parsePlannedExercise({
      plannedSets: "3",
      targetRepMin: "10",
      targetRepMax: "8",
    });
    expect(swapped).toEqual({
      ok: false,
      details: {
        targetRepMax: "The top of the range can't be below the bottom.",
      },
    });
    const zero = parsePlannedExercise({
      plannedSets: "0",
      targetRepMin: "0",
      targetRepMax: "0",
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok)
      expect(Object.keys(zero.details).sort()).toEqual([
        "plannedSets",
        "targetRepMax",
        "targetRepMin",
      ]);
    expect(
      parsePlannedExercise({
        plannedSets: "21",
        targetRepMin: "6",
        targetRepMax: "101",
      }).ok,
    ).toBe(false);
  });

  it("days are 1–7 or not on the schedule", () => {
    expect(parseDayOfWeek("1")).toEqual({ ok: true, value: 1 });
    expect(parseDayOfWeek(null)).toEqual({ ok: true, value: null });
    expect(parseDayOfWeek("none")).toEqual({ ok: true, value: null });
    expect(parseDayOfWeek(0).ok).toBe(false);
    expect(parseDayOfWeek("8").ok).toBe(false);
  });
});
