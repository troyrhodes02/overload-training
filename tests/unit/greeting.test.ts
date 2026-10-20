import fs from "node:fs";
import path from "node:path";
import type { DashboardDto } from "@/lib/logging/queries";
import {
  CLAUSES,
  LATE_CLAUSES,
  LATE_NIGHT,
  SALUTATIONS,
  WELCOMES,
  composeGreeting,
  greetingSituation,
  isLateNight,
  pickVariant,
  timeBand,
  type GreetingInput,
} from "@/lib/personalization/greeting";

/**
 * The Today greeting (Personalization & Navigation Polish, spec §14.3): a pure
 * function. Situations come from the dashboard's own state; time comes from
 * the account's stored zone (never the server's); wording is deterministic
 * per account + local date + situation, and never advises or celebrates.
 */

// --- fixtures ---------------------------------------------------------------
const today = (
  kind: "pending" | "in_progress" | "complete",
  name = "Push Day 1",
) =>
  ({
    kind,
    sessionId: "s1",
    loggedSessionId: kind === "pending" ? null : "l1",
    sessionName: name,
    scheduledFor: "2026-10-19",
    week: 2,
    scheduledDeloadWeek: false,
    gymName: null,
    exercises: [],
    setsLogged: 0,
    cardio: [],
  }) as unknown as DashboardDto;

const cardioEntry = (type: string, logged: boolean) => ({
  scheduledFor: "2026-10-21",
  dateIso: "2026-10-21",
  planned: { type, durationMin: 20 },
  state: logged ? "logged" : "planned",
  log: logged ? { id: "c1", type, durationMin: 20 } : null,
  differsFromPlan: false,
  mesocycleId: "m1",
  dateLabel: "Wed, Oct 21",
});

const rest = (cardio: ReturnType<typeof cardioEntry>[] = []) =>
  ({ kind: "rest", week: 2, cardio }) as unknown as DashboardDto;
const noPlan = { kind: "no_plan" } as DashboardDto;
const missed = (
  below: DashboardDto | null,
  cardio: ReturnType<typeof cardioEntry>[] = [],
) =>
  ({
    kind: "missed_day",
    today: "2026-10-19",
    missed: {
      mesocycleId: "m1",
      sessionId: "s0",
      sessionName: "Pull Day 1",
      missedOn: "2026-10-17",
      daysAgo: 2,
    },
    below,
    cardio,
  }) as unknown as DashboardDto;

const CHI = "America/Chicago";
/** An instant at a given local wall time in America/Chicago (CDT, UTC-5, Oct). */
const chicago = (hh: number, mm = 0, day = 19) =>
  new Date(Date.UTC(2026, 9, day, hh + 5, mm));

const base = (over: Partial<GreetingInput> = {}): GreetingInput => ({
  dashboard: today("pending"),
  firstName: "Sam",
  timeZone: CHI,
  firstVisit: false,
  accountKey: "11111111-1111-1111-1111-111111111111",
  now: chicago(8, 12),
  ...over,
});

// --- the design doc's library (docs/design/…-design-doc.md, Screen 1) -------
describe("wording library", () => {
  it("equals the design doc's library, verbatim", () => {
    expect(CLAUSES).toEqual({
      planned: ["{S} is up.", "{S} today.", "Today is {S}."],
      underway: [
        "{S} is underway.",
        "{S} is in progress.",
        "{S} is still open.",
      ],
      cardio_planned: ["{C} is up.", "{C} today.", "{C} is on today's plan."],
      done: ["{S} is done.", "{S} is logged.", "Today's training is logged."],
      done_cardio: [
        "{C} is logged.",
        "Today's training is logged.",
        "{C} is done.",
      ],
      rest: [
        "Rest day today.",
        "Nothing planned today.",
        "Today is a rest day.",
      ],
      no_plan: [
        "No active plan yet.",
        "Nothing scheduled yet.",
        "No plan is running right now.",
      ],
    });
    expect(LATE_NIGHT).toEqual([
      "Late session, {N}. {S} is still up.",
      "Working late, {N}. {S} is still open.",
      "Late one tonight, {N}. {S} is still up.",
    ]);
    expect(LATE_CLAUSES).toEqual({
      planned: "{S} is still up.",
      underway: "{S} is still open.",
    });
    expect(WELCOMES).toEqual(["Welcome to Overload, {N}.", "Welcome, {N}."]);
    expect(SALUTATIONS).toEqual({
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening",
      night: "Hello",
      unknown: "Hello",
    });
  });

  it("the design doc still carries every variant (copy changes go through it)", () => {
    const doc = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/design/10-personalization-navigation-polish-design-doc.md",
      ),
      "utf8",
    );
    for (const list of Object.values(CLAUSES))
      for (const clause of list) expect(doc).toContain(clause);
    for (const v of [...LATE_NIGHT, ...WELCOMES]) expect(doc).toContain(v);
  });
});

// --- situations -------------------------------------------------------------
describe("greetingSituation", () => {
  it.each<[string, DashboardDto, string]>([
    ["no plan", noPlan, "no_plan"],
    ["rest, no cardio", rest(), "rest"],
    [
      "cardio-only, pending",
      rest([cardioEntry("Incline Walk", false)]),
      "cardio_planned",
    ],
    [
      "cardio-only, all logged",
      rest([cardioEntry("Incline Walk", true)]),
      "done_cardio",
    ],
    [
      "cardio-only, one of two logged",
      rest([cardioEntry("Cycling", true), cardioEntry("Incline Walk", false)]),
      "cardio_planned",
    ],
    ["pending", today("pending"), "planned"],
    ["in progress", today("in_progress"), "underway"],
    ["complete", today("complete"), "done"],
    ["missed day, today pending", missed(today("pending")), "planned"],
    ["missed day, today complete", missed(today("complete")), "done"],
    ["missed day, rest today", missed(null), "rest"],
    [
      "missed day, cardio today",
      missed(null, [cardioEntry("Cycling", false)]),
      "cardio_planned",
    ],
  ])("%s → %s", (_, dash, expected) => {
    expect(greetingSituation(dash)).toBe(expected);
  });

  it("never mentions the missed day itself", () => {
    const text = composeGreeting(base({ dashboard: missed(today("pending")) }));
    expect(text).not.toMatch(/Pull Day 1|missed|yesterday/i);
    expect(text).toContain("Push Day 1");
  });
});

// --- time -------------------------------------------------------------------
describe("time of day uses the account's stored zone", () => {
  it.each<[number, number, string]>([
    [3, 59, "night"],
    [4, 0, "morning"],
    [11, 59, "morning"],
    [12, 0, "afternoon"],
    [16, 59, "afternoon"],
    [17, 0, "evening"],
    [20, 59, "evening"],
    [21, 0, "evening"],
    [23, 59, "evening"],
    [0, 0, "night"],
  ])("%i:%i Chicago → %s", (h, m, band) => {
    expect(timeBand(chicago(h, m), CHI)).toBe(band);
  });

  it.each<[number, number, boolean]>([
    [20, 59, false],
    [21, 0, true],
    [23, 30, true],
    [0, 0, true],
    [3, 59, true],
    [4, 0, false],
    [12, 0, false],
  ])("late night at %i:%i → %s", (h, m, late) => {
    expect(isLateNight(chicago(h, m), CHI)).toBe(late);
  });

  it("the same instant reads differently for accounts in different zones", () => {
    const instant = new Date(Date.UTC(2026, 9, 19, 12, 0)); // 12:00 UTC
    expect(timeBand(instant, "Pacific/Kiritimati")).toBe("night"); // 02:00 +14
    expect(timeBand(instant, "Pacific/Pago_Pago")).toBe("night"); // 01:00 -11
    expect(timeBand(instant, "America/Chicago")).toBe("morning"); // 07:00
    expect(timeBand(instant, "Asia/Tokyo")).toBe("evening"); // 21:00
  });

  it("does not depend on the server's own timezone", () => {
    const original = process.env.TZ;
    const results: string[] = [];
    for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      results.push(composeGreeting(base({ now: chicago(21, 30) })));
    }
    process.env.TZ = original;
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toMatch(
      /^(Late session|Working late|Late one tonight), Sam\./,
    );
  });

  it("follows daylight-saving changes in the account's zone", () => {
    const NY = "America/New_York";
    // 2026-03-08: clocks jump 2:00 → 3:00 EST→EDT. 07:59 UTC = 03:59 EDT.
    expect(timeBand(new Date(Date.UTC(2026, 2, 8, 7, 59)), NY)).toBe("night");
    expect(timeBand(new Date(Date.UTC(2026, 2, 8, 8, 0)), NY)).toBe("morning");
    // 2026-11-01: back to EST. 08:59 UTC = 03:59 EST; 09:00 UTC = 04:00 EST.
    expect(timeBand(new Date(Date.UTC(2026, 10, 1, 8, 59)), NY)).toBe("night");
    expect(timeBand(new Date(Date.UTC(2026, 10, 1, 9, 0)), NY)).toBe("morning");
  });
});

// --- composition ------------------------------------------------------------
describe("composeGreeting", () => {
  it("names the lifter, greets by local time, and states today's session", () => {
    const text = composeGreeting(base());
    expect(text).toMatch(/^Good morning, Sam\. /);
    expect([
      "Push Day 1 is up.",
      "Push Day 1 today.",
      "Today is Push Day 1.",
    ]).toContain(text.replace("Good morning, Sam. ", ""));
  });

  it.each<[DashboardDto, RegExp]>([
    [
      today("in_progress"),
      /Push Day 1 (is underway|is in progress|is still open)\.$/,
    ],
    [
      today("complete"),
      /(Push Day 1 is (done|logged)|Today's training is logged)\.$/,
    ],
    [rest(), /(Rest day today|Nothing planned today|Today is a rest day)\.$/],
    [
      rest([cardioEntry("Incline Walk", false)]),
      /Incline Walk (is up|today|is on today's plan)\.$/,
    ],
    [
      rest([cardioEntry("Incline Walk", true)]),
      /(Incline Walk is (logged|done)|Today's training is logged)\.$/,
    ],
    [
      noPlan,
      /(No active plan yet|Nothing scheduled yet|No plan is running right now)\.$/,
    ],
  ])("situation clause for %o", (dashboard, clause) => {
    expect(composeGreeting(base({ dashboard }))).toMatch(clause);
  });

  it("late night replaces the salutation for a planned or underway workout only", () => {
    const late = (dashboard: DashboardDto) =>
      composeGreeting(base({ dashboard, now: chicago(22, 41) }));
    expect(late(today("pending"))).toMatch(
      /^(Late session|Working late|Late one tonight), Sam\. Push Day 1 is still (up|open)\.$/,
    );
    expect(late(today("in_progress"))).toMatch(
      /^(Late session|Working late|Late one tonight), Sam\./,
    );
    for (const d of [
      today("complete"),
      rest(),
      noPlan,
      rest([cardioEntry("Cycling", false)]),
    ]) {
      expect(late(d)).toMatch(/^Good evening, Sam\. /);
    }
    // After midnight, the non-workout salutation is a plain Hello.
    expect(
      composeGreeting(base({ dashboard: rest(), now: chicago(0, 35) })),
    ).toMatch(/^Hello, Sam\. /);
  });

  it("never claims done when sets remain, or a workout on a rest day / with no plan", () => {
    for (let day = 1; day <= 28; day++) {
      const now = chicago(9, 0, day);
      for (const d of [today("pending"), today("in_progress")])
        expect(composeGreeting(base({ dashboard: d, now }))).not.toMatch(
          /done|logged/i,
        );
      for (const d of [rest(), noPlan])
        expect(composeGreeting(base({ dashboard: d, now }))).not.toMatch(
          /Push Day 1|workout|up\./,
        );
    }
  });

  describe("first visit", () => {
    it("without a plan: a welcome and nothing implying a schedule", () => {
      for (let day = 1; day <= 20; day++) {
        const text = composeGreeting(
          base({
            dashboard: noPlan,
            firstVisit: true,
            firstName: "Jordan",
            now: chicago(10, 0, day),
          }),
        );
        expect(["Welcome to Overload, Jordan.", "Welcome, Jordan."]).toContain(
          text,
        );
      }
    });

    it("with a seeded plan: the welcome plus today's clause", () => {
      const text = composeGreeting(
        base({
          dashboard: today("pending", "Upper Body"),
          firstVisit: true,
          firstName: "Jordan",
        }),
      );
      expect(text).toMatch(
        /^(Welcome to Overload|Welcome), Jordan\. (Upper Body is up|Upper Body today|Today is Upper Body)\.$/,
      );
    });

    it("late at night: the welcome plus the late clause", () => {
      const text = composeGreeting(
        base({
          dashboard: today("pending", "Upper Body"),
          firstVisit: true,
          firstName: "Jordan",
          now: chicago(23, 0),
        }),
      );
      expect(text).toMatch(
        /^(Welcome to Overload|Welcome), Jordan\. Upper Body is still up\.$/,
      );
    });
  });

  describe("missing pieces", () => {
    it("no first name drops the name and its comma, in every family", () => {
      const nameless = (over: Partial<GreetingInput>) =>
        composeGreeting(base({ firstName: null, ...over }));
      expect(nameless({})).toMatch(/^Good morning\. Push Day 1/);
      expect(nameless({ now: chicago(22, 0) })).toMatch(
        /^(Late session|Working late|Late one tonight)\. Push Day 1/,
      );
      expect(nameless({ dashboard: noPlan, firstVisit: true })).toMatch(
        /^(Welcome to Overload|Welcome)\.$/,
      );
      expect(composeGreeting(base({ firstName: "   " }))).toMatch(
        /^Good morning\. /,
      );
      for (const t of [nameless({}), nameless({ now: chicago(22, 0) })]) {
        expect(t).not.toMatch(/ ,|,\.|\s{2}|\{|\}/);
      }
    });

    it("an unusable timezone says Hello, never late night, and still follows the situation", () => {
      const text = composeGreeting(
        base({ timeZone: null, now: chicago(22, 0) }),
      );
      expect(text).toMatch(/^Hello, Sam\. /);
      expect(text).toContain("Push Day 1");
      expect(
        composeGreeting(base({ timeZone: null, dashboard: rest() })),
      ).toMatch(
        /^Hello, Sam\. (Rest day today|Nothing planned today|Today is a rest day)\.$/,
      );
    });

    it("the lifter's own text is never read as a placeholder", () => {
      const text = composeGreeting(
        base({ dashboard: today("pending", "{N} {Sal} Day") }),
      );
      expect(text).toContain("{N} {Sal} Day");
    });
  });
});

// --- stability --------------------------------------------------------------
describe("deterministic, stable wording", () => {
  it("same account, situation, and local date → the same sentence all day", () => {
    const seen = new Set<string>();
    for (let h = 4; h < 12; h++)
      for (const m of [0, 17, 59])
        seen.add(composeGreeting(base({ now: chicago(h, m) })));
    expect(seen.size).toBe(1);
  });

  it("re-rendering a second later gives the identical sentence", () => {
    const a = composeGreeting(base({ now: chicago(14, 0) }));
    const b = composeGreeting(
      base({ now: new Date(chicago(14, 0).getTime() + 1000) }),
    );
    expect(a).toBe(b);
  });

  it("varies across days, and every variant is reachable", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 60; day++) {
      const now = new Date(Date.UTC(2026, 0, day, 15, 0)); // 09:00 CST
      seen.add(composeGreeting(base({ now })));
    }
    expect(seen.size).toBe(3);
  });

  it("different accounts on the same day may read differently (seeded by account)", () => {
    const users = Array.from({ length: 30 }, (_, i) => `user-${i}`);
    const texts = new Set(
      users.map((accountKey) => composeGreeting(base({ accountKey }))),
    );
    expect(texts.size).toBeGreaterThan(1);
  });

  it("pickVariant is stable and in range", () => {
    expect(pickVariant(["a", "b", "c"], "seed")).toBe(
      pickVariant(["a", "b", "c"], "seed"),
    );
    for (let i = 0; i < 200; i++)
      expect(["a", "b", "c"]).toContain(pickVariant(["a", "b", "c"], `s${i}`));
  });
});

// --- tone -------------------------------------------------------------------
describe("tone guard", () => {
  const BANNED =
    /let's|crush|you got this|don't forget|time to|you should|suggest|recommend|great job|keep it up|!|\?/i;
  const all = [
    ...Object.values(CLAUSES).flat(),
    ...LATE_NIGHT,
    ...Object.values(LATE_CLAUSES),
    ...WELCOMES,
    ...Object.values(SALUTATIONS),
  ];

  it("no variant has emoji, exclamation, question, advice, or pressure", () => {
    for (const t of all) {
      expect(t).not.toMatch(BANNED);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("no composed greeting does either, across situations, names, and times", () => {
    const dashes = [
      noPlan,
      rest(),
      rest([cardioEntry("Cycling", false)]),
      today("pending"),
      today("in_progress"),
      today("complete"),
    ];
    for (const dashboard of dashes)
      for (const firstName of ["Sam", null])
        for (const firstVisit of [false, true])
          for (const h of [2, 9, 13, 18, 22]) {
            const t = composeGreeting(
              base({ dashboard, firstName, firstVisit, now: chicago(h) }),
            );
            expect(t).not.toMatch(BANNED);
            expect(t).not.toMatch(/\n/);
          }
  });

  it("greeting.ts is pure: no Prisma, React, server-only, next/*, clock, or randomness", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/personalization/greeting.ts"),
      "utf8",
    );
    const imports = [
      ...src.matchAll(/^import\s+(type\s+)?.*from\s+"([^"]+)";/gm),
    ];
    for (const [, isType, from] of imports) {
      if (!isType) expect(from).not.toMatch(/prisma|react|server-only|^next/);
    }
    expect(src).not.toMatch(/Date\.now|new Date\(|Math\.random/);
  });
});
