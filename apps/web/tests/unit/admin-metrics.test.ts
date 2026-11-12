import { computeOverview, type MetricProfile } from "@/lib/admin/overview";

/**
 * The Overview's arithmetic (Admin Center & Feedback, spec §9; R12–R14),
 * tested against its documented definitions: windows include today and the
 * 6 / 29 days before, "came back" is strictly a later calendar day than
 * signup, cohorts follow each account's own signup date, and nothing divides
 * by zero.
 */

const TODAY = "2026-10-22";

let n = 0;
function profile(over: Partial<MetricProfile> = {}): MetricProfile {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    createdAt: new Date("2026-10-01T12:00:00Z"),
    timeZone: "UTC",
    status: "active",
    lastActiveOn: null,
    ...over,
  };
}

const run = (
  profiles: MetricProfile[],
  withPlan: string[] = [],
  logged: string[] = [],
) =>
  computeOverview({
    profiles,
    withPlan: new Set(withPlan),
    loggedWorkout: new Set(logged),
    today: TODAY,
    timeZone: "America/Chicago",
  });

it("nobody registered: zeros, no percentages, six empty months", () => {
  const o = run([]);
  expect(o).toMatchObject({
    registered: 0,
    active7: 0,
    newThisMonth: 0,
    pct: { active7: null, active30: null, withPlan: null, loggedWorkout: null },
    monthStart: "2026-10-01",
    timeZone: "America/Chicago",
  });
  expect(o.cohorts.map((c) => c.month)).toEqual([
    "2026-10",
    "2026-09",
    "2026-08",
    "2026-07",
    "2026-06",
    "2026-05",
  ]);
  expect(o.cohorts.every((c) => c.signedUp === 0 && c.cameBack === null)).toBe(
    true,
  );
});

it("the 7- and 30-day windows include today and exclude the day past the edge", () => {
  const ps = [
    profile({ lastActiveOn: "2026-10-22" }), // today
    profile({ lastActiveOn: "2026-10-16" }), // T-6: in 7
    profile({ lastActiveOn: "2026-10-15" }), // T-7: out of 7, in 30
    profile({ lastActiveOn: "2026-09-23" }), // T-29: in 30
    profile({ lastActiveOn: "2026-09-22" }), // T-30: out
    profile({ lastActiveOn: null }),
  ];
  const o = run(ps);
  expect(o.active7).toBe(2);
  expect(o.active30).toBe(4);
  expect(o.pct.active7).toBe(33);
  expect(o.pct.active30).toBe(67);
});

it("counts suspended accounts as registered and reports them", () => {
  const o = run([profile(), profile({ status: "suspended" })]);
  expect(o.registered).toBe(2);
  expect(o.suspended).toBe(1);
});

it("new this month follows each account's own signup date", () => {
  const ps = [
    profile({ createdAt: new Date("2026-10-01T00:30:00Z") }), // Oct 1 UTC
    // 2026-10-01 03:00Z is still Sep 30 in Chicago: last month's signup.
    profile({
      createdAt: new Date("2026-10-01T03:00:00Z"),
      timeZone: "America/Chicago",
    }),
    profile({ createdAt: new Date("2026-09-30T12:00:00Z") }),
  ];
  const o = run(ps);
  expect(o.newThisMonth).toBe(1);
  expect(o.cohorts[0]).toMatchObject({ month: "2026-10", signedUp: 1 });
  expect(o.cohorts[1]).toMatchObject({ month: "2026-09", signedUp: 2 });
});

it("came back means a later calendar day than signup, never the same day", () => {
  const signup = new Date("2026-09-10T15:00:00Z");
  const ps = [
    profile({ createdAt: signup, lastActiveOn: "2026-09-10" }), // same day
    profile({ createdAt: signup, lastActiveOn: "2026-09-11" }), // next day
    profile({ createdAt: signup, lastActiveOn: "2026-10-20" }), // and recent
    profile({ createdAt: signup, lastActiveOn: null }),
  ];
  const sep = run(ps).cohorts[1];
  expect(sep).toEqual({
    month: "2026-09",
    signedUp: 4,
    cameBack: 2,
    cameBackPct: 50,
    active30: 1,
    active30Pct: 25,
  });
});

it("adoption counts come only from the sets of accounts with a plan or a set", () => {
  const a = profile();
  const b = profile();
  const c = profile();
  const o = run([a, b, c], [a.id, b.id], [a.id, "not-a-profile"]);
  expect(o.withPlan).toBe(2);
  expect(o.loggedWorkout).toBe(1); // an id without a profile is not counted
  expect(o.pct).toMatchObject({ withPlan: 67, loggedWorkout: 33 });
});

it("crosses a year boundary for the cohort months", () => {
  const o = computeOverview({
    profiles: [],
    withPlan: new Set(),
    loggedWorkout: new Set(),
    today: "2027-02-03",
    timeZone: "UTC",
  });
  expect(o.cohorts.map((c) => c.month)).toEqual([
    "2027-02",
    "2027-01",
    "2026-12",
    "2026-11",
    "2026-10",
    "2026-09",
  ]);
});
