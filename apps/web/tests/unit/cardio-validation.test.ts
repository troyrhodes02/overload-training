import {
  CARDIO_MINUTES_INVALID,
  CARDIO_MINUTES_TOO_LONG,
  CARDIO_TYPE_REQUIRED,
  CARDIO_TYPE_TOO_LONG,
  parseCardioEntry,
  parseCardioMinutes,
  parseCardioType,
} from "@/lib/cardio/validation";

/** Cardio Logging spec §12 — type + whole minutes, the same for plan and log. */
describe("cardio type", () => {
  it.each([
    ["Incline Walk", "Incline Walk"],
    ["  Bike  ", "Bike"],
    ["Pickleball warm-up walk", "Pickleball warm-up walk"],
    ["x".repeat(40), "x".repeat(40)],
  ])("accepts %p as %p", (raw, value) => {
    expect(parseCardioType(raw)).toEqual({ ok: true, value });
  });

  it.each([[""], ["   "], ["\t\n"], [null], [undefined], [42]])(
    "rejects %p as missing",
    (raw) => {
      expect(parseCardioType(raw)).toEqual({
        ok: false,
        details: { type: CARDIO_TYPE_REQUIRED },
      });
    },
  );

  it("rejects more than 40 characters", () => {
    expect(parseCardioType("x".repeat(41))).toEqual({
      ok: false,
      details: { type: CARDIO_TYPE_TOO_LONG },
    });
  });
});

describe("cardio minutes", () => {
  it.each([
    ["20", 20],
    [" 27 ", 27],
    [20, 20],
    ["1", 1],
    ["600", 600],
  ])("accepts %p as %p", (raw, value) => {
    expect(parseCardioMinutes(raw)).toEqual({ ok: true, value });
  });

  it.each([
    [""],
    ["   "],
    [null],
    [undefined],
    ["0"],
    [0],
    ["-5"],
    [-5],
    ["2.5"],
    [2.5],
    ["1e2"],
    ["20 min"],
    ["abc"],
  ])("rejects %p", (raw) => {
    expect(parseCardioMinutes(raw)).toEqual({
      ok: false,
      details: { durationMin: CARDIO_MINUTES_INVALID },
    });
  });

  it("rejects more than 600 minutes", () => {
    expect(parseCardioMinutes("601")).toEqual({
      ok: false,
      details: { durationMin: CARDIO_MINUTES_TOO_LONG },
    });
  });
});

describe("a cardio entry", () => {
  it("collects every field error at once", () => {
    expect(parseCardioEntry({ type: " ", durationMin: "0" })).toEqual({
      ok: false,
      details: {
        type: CARDIO_TYPE_REQUIRED,
        durationMin: CARDIO_MINUTES_INVALID,
      },
    });
  });

  it("returns the trimmed type and whole minutes", () => {
    expect(parseCardioEntry({ type: " Bike ", durationMin: "30" })).toEqual({
      ok: true,
      value: { type: "Bike", durationMin: 30 },
    });
  });
});
