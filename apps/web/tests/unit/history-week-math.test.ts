import {
  resolveRequestedWeek,
  weekStartFor,
} from "@/lib/logging/history-week-math";

/** OVE-141: week boundaries for all-time history. */
describe("weekStartFor", () => {
  it("Monday-anchored weeks (no active block)", () => {
    expect(weekStartFor("2026-11-09", 1)).toBe("2026-11-09"); // Monday
    expect(weekStartFor("2026-11-15", 1)).toBe("2026-11-09"); // Sunday
    expect(weekStartFor("2026-11-16", 1)).toBe("2026-11-16");
  });

  it("weeks anchored on the active block's start weekday (Thursday)", () => {
    expect(weekStartFor("2026-11-12", 4)).toBe("2026-11-12"); // Thursday
    expect(weekStartFor("2026-11-18", 4)).toBe("2026-11-12"); // Wednesday
    expect(weekStartFor("2026-11-11", 4)).toBe("2026-11-05");
  });

  it("crosses month and year boundaries", () => {
    expect(weekStartFor("2027-01-02", 1)).toBe("2026-12-28");
    expect(weekStartFor("2026-03-01", 1)).toBe("2026-02-23");
  });
});

describe("resolveRequestedWeek", () => {
  const ctx = {
    thisWeekStart: "2026-11-09",
    anchorDow: 1,
    active: { startDate: "2026-10-26", lengthWeeks: 5 },
  };

  it("any date resolves to its week's start", () => {
    expect(resolveRequestedWeek("2026-10-01", ctx)).toBe("2026-09-28");
  });

  it("a legacy active-block week number still works", () => {
    expect(resolveRequestedWeek("2", ctx)).toBe("2026-11-02");
  });

  it("missing, malformed, or impossible values mean this week", () => {
    for (const v of [undefined, null, "", "abc", "2026-02-30", "0", "99"]) {
      expect(resolveRequestedWeek(v, ctx)).toBe("2026-11-09");
    }
  });

  it("a week number means nothing without an active block", () => {
    expect(resolveRequestedWeek("2", { ...ctx, active: null })).toBe(
      "2026-11-09",
    );
  });
});
