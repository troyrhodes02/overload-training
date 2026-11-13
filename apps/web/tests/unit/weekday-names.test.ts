import { weekdaysFromNames, weekdayFromName } from "@/lib/plan/weekday-names";

const s = (id: string, name: string, dayOfWeek: number | null = null) => ({
  id,
  name,
  dayOfWeek,
});

describe("weekdayFromName", () => {
  it("reads a leading weekday, full or short, any case", () => {
    expect(weekdayFromName("Monday — Workout A")).toBe(1);
    expect(weekdayFromName("wed push")).toBe(3);
    expect(weekdayFromName("  Fri: Legs")).toBe(5);
    expect(weekdayFromName("Sunday")).toBe(7);
  });
  it("ignores names that do not lead with a weekday", () => {
    expect(weekdayFromName("Push Day 1")).toBeNull();
    expect(weekdayFromName("Workout A (Monday)")).toBeNull();
    expect(weekdayFromName("Monster Legs")).toBeNull();
    expect(weekdayFromName("")).toBeNull();
  });
});

describe("weekdaysFromNames", () => {
  it("reads Monday/Wednesday/Friday for the imported shape", () => {
    expect(
      weekdaysFromNames([
        s("a", "Monday — Workout A"),
        s("b", "Wednesday — Workout B"),
        s("c", "Friday — Workout C"),
      ]),
    ).toEqual([
      { sessionId: "a", dayOfWeek: 1 },
      { sessionId: "b", dayOfWeek: 3 },
      { sessionId: "c", dayOfWeek: 5 },
    ]);
  });
  it("offers nothing once any session is already scheduled", () => {
    expect(
      weekdaysFromNames([s("a", "Monday A"), s("b", "Wednesday B", 3)]),
    ).toEqual([]);
  });
  it("skips a weekday two sessions both claim, and unnamed sessions", () => {
    expect(
      weekdaysFromNames([
        s("a", "Monday A"),
        s("b", "Monday B"),
        s("c", "Friday C"),
        s("d", "Core"),
      ]),
    ).toEqual([{ sessionId: "c", dayOfWeek: 5 }]);
  });
  it("never decides a start date: it returns weekdays only", () => {
    const out = weekdaysFromNames([s("a", "Tuesday A")]);
    expect(Object.keys(out[0]).sort()).toEqual(["dayOfWeek", "sessionId"]);
  });
});
