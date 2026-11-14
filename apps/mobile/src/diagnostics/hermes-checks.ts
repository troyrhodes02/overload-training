import {
  addDays,
  formatMonthDay,
  formatPlanDate,
  isoDateInZone,
  isValidTimeZone,
  todayIso,
} from "@overload/shared/plan/calendar";
import { accountTodayLabel } from "../today/date";

/**
 * The Hermes date and time-zone spike (spec §12, OQ7). The same golden
 * values run under Node in Jest (tests/hermes-checks.test.ts) and under
 * Hermes in the app (More → Diagnostics), so the two runtimes are compared
 * against one answer key. Pure: shared calendar code only.
 */
export type CheckResult = { ok: boolean; actual: string; expected: string };
export type HermesCheck = { id: string; run: () => CheckResult };

const eq = (actual: unknown, expected: unknown): CheckResult => ({
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  actual: JSON.stringify(actual),
  expected: JSON.stringify(expected),
});

const zoneDate = (
  instant: string,
  zone: string,
  expected: string,
): HermesCheck => ({
  id: `isoDateInZone ${zone} ${instant}`,
  run: () => eq(isoDateInZone(new Date(instant), zone), expected),
});

export const HERMES_CHECKS: HermesCheck[] = [
  {
    id: "isValidTimeZone accepts IANA zones",
    run: () =>
      eq(
        ["America/Chicago", "Pacific/Auckland", "Asia/Kolkata", "UTC"].map(
          isValidTimeZone,
        ),
        [true, true, true, true],
      ),
  },
  {
    id: "isValidTimeZone refuses junk",
    run: () =>
      eq(["Mars/Phobos", "", "Not a zone"].map(isValidTimeZone), [
        false,
        false,
        false,
      ]),
  },
  // Chicago spring-forward (2026-03-08 02:00 local → 03:00).
  zoneDate("2026-03-08T07:59:59Z", "America/Chicago", "2026-03-08"),
  zoneDate("2026-03-08T05:59:59Z", "America/Chicago", "2026-03-07"),
  // Chicago fall-back (2026-11-01 02:00 local → 01:00).
  zoneDate("2026-11-01T05:30:00Z", "America/Chicago", "2026-11-01"),
  zoneDate("2026-11-01T04:59:59Z", "America/Chicago", "2026-10-31"),
  // Late evening in Chicago is still the earlier day.
  zoneDate("2026-11-15T05:30:00Z", "America/Chicago", "2026-11-14"),
  // Across the date line.
  zoneDate("2026-11-14T11:30:00Z", "Pacific/Auckland", "2026-11-15"),
  // A half-hour offset.
  zoneDate("2026-11-14T18:29:59Z", "Asia/Kolkata", "2026-11-14"),
  zoneDate("2026-11-14T18:30:00Z", "Asia/Kolkata", "2026-11-15"),
  zoneDate("2026-11-14T23:59:59Z", "UTC", "2026-11-14"),
  {
    id: "todayIso equals isoDateInZone",
    run: () => {
      const at = new Date("2026-11-15T05:30:00Z");
      return eq(
        todayIso("America/Chicago", at),
        isoDateInZone(at, "America/Chicago"),
      );
    },
  },
  {
    id: "formatPlanDate and formatMonthDay match the web",
    run: () =>
      eq(
        [
          formatPlanDate("2026-11-02"),
          formatMonthDay("2026-10-13", "2026-11-14"),
          formatMonthDay("2025-12-29", "2026-11-14"),
        ],
        ["Mon, Nov 2", "Oct 13", "Dec 29, 2025"],
      ),
  },
  {
    id: "addDays keeps UTC-midnight arithmetic across DST",
    run: () =>
      eq(
        [
          addDays("2026-03-07", 1),
          addDays("2026-03-08", 1),
          addDays("2026-10-31", 2),
        ],
        ["2026-03-08", "2026-03-09", "2026-11-02"],
      ),
  },
  {
    id: "Today's label in Chicago late evening",
    run: () =>
      eq(
        accountTodayLabel("America/Chicago", new Date("2026-11-15T05:30:00Z")),
        "Saturday, November 14",
      ),
  },
  {
    id: "the device's own zone is valid",
    run: () => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return {
        ok: isValidTimeZone(zone),
        actual: JSON.stringify(zone),
        expected: "a valid IANA zone",
      };
    },
  },
];

export function runHermesChecks(): (CheckResult & { id: string })[] {
  return HERMES_CHECKS.map((c) => {
    try {
      return { id: c.id, ...c.run() };
    } catch (error) {
      return {
        id: c.id,
        ok: false,
        actual: error instanceof Error ? error.message : "threw",
        expected: "no exception",
      };
    }
  });
}
