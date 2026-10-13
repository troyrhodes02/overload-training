const cookieStore = { get: jest.fn() };
const cookiesMock = jest.fn(async () => cookieStore);
jest.mock("next/headers", () => ({ cookies: () => cookiesMock() }));
// formatGoalDate is pure; its module also holds DB reads we never call here.
jest.mock("@/lib/db", () => ({ prisma: {} }));

import { isoDateInZone, isValidTimeZone, todayIso } from "@/lib/plan/calendar";
import { lifterTimeZone, lifterToday } from "@/lib/time/lifter-time-zone";
import { formatGoalDate } from "@/lib/goals/queries";
import { TIME_ZONE_COOKIE } from "@/lib/time/time-zone";

/**
 * "Today" follows the lifter's own time zone (from the browser, via a
 * cookie); date arithmetic stays on UTC midnights. 2026-10-13T02:30Z is
 * Monday evening in Dallas and already Tuesday in UTC and Tokyo.
 */
const MONDAY_EVENING_CDT = new Date("2026-10-13T02:30:00Z");

describe("calendar date in a time zone", () => {
  it.each([
    ["UTC", "2026-10-13"],
    ["America/Chicago", "2026-10-12"],
    ["America/Los_Angeles", "2026-10-12"],
    ["Asia/Tokyo", "2026-10-13"],
    ["Pacific/Kiritimati", "2026-10-13"],
  ])("%s → %s", (zone, expected) => {
    expect(isoDateInZone(MONDAY_EVENING_CDT, zone)).toBe(expected);
  });

  it("todayIso defaults to UTC and accepts a zone", () => {
    expect(todayIso(undefined, MONDAY_EVENING_CDT)).toBe("2026-10-13");
    expect(todayIso("America/Chicago", MONDAY_EVENING_CDT)).toBe("2026-10-12");
  });

  it("validates IANA zones", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe("the lifter's time zone (server)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cookiesMock.mockImplementation(async () => cookieStore);
  });

  it("reads the zone the browser stored", async () => {
    cookieStore.get.mockReturnValue({ value: "America%2FChicago" });
    expect(await lifterTimeZone()).toBe("America/Chicago");
    expect(cookieStore.get).toHaveBeenCalledWith(TIME_ZONE_COOKIE);
  });

  it("falls back to UTC with no cookie, a bad value, or no request", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await lifterTimeZone()).toBe("UTC");
    cookieStore.get.mockReturnValue({ value: "Not/A_Zone" });
    expect(await lifterTimeZone()).toBe("UTC");
    cookieStore.get.mockReturnValue({ value: "%E0%A4%A" }); // malformed encoding
    expect(await lifterTimeZone()).toBe("UTC");
    cookiesMock.mockImplementation(async () => {
      throw new Error("cookies was called outside a request scope");
    });
    expect(await lifterTimeZone()).toBe("UTC");
  });

  it("today is the lifter's calendar date", async () => {
    jest.useFakeTimers().setSystemTime(MONDAY_EVENING_CDT);
    try {
      cookieStore.get.mockReturnValue({ value: "America/Chicago" });
      expect(await lifterToday()).toBe("2026-10-12");
      cookieStore.get.mockReturnValue(undefined);
      expect(await lifterToday()).toBe("2026-10-13");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("goal timestamps render on the lifter's calendar", () => {
  it("a goal reached Monday evening in Dallas reads Oct 12 there", () => {
    expect(formatGoalDate(MONDAY_EVENING_CDT, "America/Chicago")).toBe(
      "Oct 12, 2026",
    );
    expect(formatGoalDate(MONDAY_EVENING_CDT)).toBe("Oct 13, 2026");
  });
});
