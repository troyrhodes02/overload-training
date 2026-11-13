// formatGoalDate / accountToday are pure; their modules also hold DB reads we
// never call here.
jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));

import fs from "node:fs";
import path from "node:path";
import { isoDateInZone, isValidTimeZone, todayIso } from "@/lib/plan/calendar";
import { accountToday, type Account } from "@/lib/data/account";
import { formatGoalDate } from "@/lib/goals/queries";

/**
 * "Today" follows the ACCOUNT's stored time zone (Profile.timeZone —
 * Multi-User Foundation spec R18); date arithmetic stays on UTC midnights.
 * 2026-10-13T02:30Z is Monday evening in Dallas and already Tuesday in UTC
 * and Tokyo.
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

describe("today is the account's stored time zone (server)", () => {
  const account = (timeZone: string) =>
    ({ userId: "u", timeZone, db: {} }) as unknown as Account;

  it("today is the account's calendar date, not the server's", () => {
    jest.useFakeTimers().setSystemTime(MONDAY_EVENING_CDT);
    try {
      expect(accountToday(account("America/Chicago"))).toBe("2026-10-12");
      expect(accountToday(account("UTC"))).toBe("2026-10-13");
      expect(accountToday(account("Asia/Tokyo"))).toBe("2026-10-13");
    } finally {
      jest.useRealTimers();
    }
  });

  it("11:30 pm Sunday in the account's zone is still Sunday", () => {
    // 2026-10-19T04:30Z = Sunday 23:30 in America/Chicago (CDT, UTC-5).
    jest.useFakeTimers().setSystemTime(new Date("2026-10-19T04:30:00Z"));
    try {
      expect(accountToday(account("America/Chicago"))).toBe("2026-10-18");
    } finally {
      jest.useRealTimers();
    }
  });

  it("the browser-cookie authority is gone", () => {
    const root = path.resolve(__dirname, "..", "..");
    expect(
      fs.existsSync(path.join(root, "src/lib/time/lifter-time-zone.ts")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(root, "src/components/shell/time-zone-sync.tsx")),
    ).toBe(false);
    const walk = (d: string): string[] =>
      fs
        .readdirSync(d, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
        );
    const offenders = walk(path.join(root, "src")).filter((f) =>
      /overload-tz|lifterToday|lifterTimeZone|TimeZoneSync/.test(
        fs.readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
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
