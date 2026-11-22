import {
  blockPosition,
  deloadWeeksOf,
  planWeekDays,
} from "@/lib/plan/week-grid";
import type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";

/**
 * Pitch 21h (spec §4, §12): the plan week's pure shaping. Week math and
 * deload rules come from the shared calendar and deload modules; this lays
 * the schedule's occurrences on seven dated days.
 */

describe("deloadWeeksOf", () => {
  it("lists every Nth week within the block", () => {
    expect(deloadWeeksOf(6, 3)).toEqual([3, 6]);
    expect(deloadWeeksOf(5, 5)).toEqual([5]);
    expect(deloadWeeksOf(10, 4)).toEqual([4, 8]);
  });
  it("is empty when the cadence is longer than the block", () => {
    expect(deloadWeeksOf(4, 6)).toEqual([]);
  });
});

describe("blockPosition", () => {
  const block = {
    startDate: "2026-11-02",
    lengthWeeks: 6,
    deloadEveryWeeks: 3,
  };
  it("before the start date is upcoming", () => {
    expect(blockPosition(block, "2026-11-01")).toEqual({
      kind: "upcoming",
      startsOn: "2026-11-02",
    });
  });
  it("the start date is week 1, the 7th day still week 1, the 8th week 2", () => {
    expect(blockPosition(block, "2026-11-02")).toMatchObject({ week: 1 });
    expect(blockPosition(block, "2026-11-08")).toMatchObject({ week: 1 });
    expect(blockPosition(block, "2026-11-09")).toMatchObject({ week: 2 });
  });
  it("marks a deload week", () => {
    expect(blockPosition(block, "2026-11-16")).toEqual({
      kind: "running",
      week: 3,
      scheduledDeloadWeek: true,
    });
  });
  it("the planned end is the last running day; the day after is ended", () => {
    expect(blockPosition(block, "2026-12-13")).toMatchObject({
      kind: "running",
      week: 6,
    });
    expect(blockPosition(block, "2026-12-14")).toEqual({
      kind: "ended",
      endedOn: "2026-12-13",
    });
  });
});

describe("planWeekDays", () => {
  const cardio = (dateIso: string) =>
    ({
      scheduledFor: dateIso,
      dateIso,
      planned: { type: "Bike", durationMin: 20 },
      state: "upcoming",
      log: null,
      differsFromPlan: false,
      mesocycleId: "m",
      dateLabel: dateIso,
    }) as CardioOccurrenceDto;

  it("seven dated days, today flagged once, rest days empty", () => {
    const days = planWeekDays({
      weekStart: "2026-11-16",
      today: "2026-11-18",
      occurrences: [
        {
          dateIso: "2026-11-16",
          sessionId: "s1",
          sessionName: "Upper A",
          state: "complete",
          loggedSessionId: "l1",
        },
      ],
      cardio: [cardio("2026-11-18")],
    });
    expect(days.map((d) => d.dateIso)).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
    expect(days.map((d) => d.isToday)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(days[0].dayLabel).toBe("Mon, Nov 16");
    expect(days[0].sessions).toEqual([
      {
        sessionId: "s1",
        sessionName: "Upper A",
        state: "complete",
        loggedSessionId: "l1",
      },
    ]);
    expect(days[1].sessions).toEqual([]);
    expect(days[2].cardio).toHaveLength(1);
    expect(days[0].cardio).toEqual([]);
  });

  it("two occurrences shifted onto one day both show on it", () => {
    const days = planWeekDays({
      weekStart: "2026-11-16",
      today: "2026-11-30",
      occurrences: [
        {
          dateIso: "2026-11-17",
          sessionId: "a",
          sessionName: "Lower A",
          state: "shifted",
          loggedSessionId: null,
        },
        {
          dateIso: "2026-11-17",
          sessionId: "b",
          sessionName: "Upper B",
          state: "upcoming",
          loggedSessionId: null,
        },
      ],
      cardio: [],
    });
    expect(days[1].sessions.map((s) => s.sessionName)).toEqual([
      "Lower A",
      "Upper B",
    ]);
    expect(days.some((d) => d.isToday)).toBe(false);
  });
});
