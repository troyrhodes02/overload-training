import fs from "node:fs";
import path from "node:path";
import {
  assertScenarioTargetAllowed,
  ScenarioTargetRefused,
} from "../../scripts/scenarios/guard";
import { stableId, seededRandom } from "../../scripts/scenarios/determinism";
import { SCENARIOS, findScenario } from "../../scripts/scenarios/registry";
import { PLATEAU_EXPECTED } from "../../scripts/scenarios/scenarios/plateau";
import { addDays, mesocycleWeekForDate } from "@/lib/plan/calendar";
import { isScheduledDeloadWeek } from "@/lib/progression/deload";
import { evaluateReactive, type Performance } from "@/lib/progression/engine";
import type { ScenarioFacts } from "../../scripts/scenarios/spec";

/**
 * Dev scenario seeding (scripts/scenarios) — the pure parts: the target
 * guard, determinism, relative dates, and that the engineered plateau facts
 * produce their states in the real engine for the right reason.
 */

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("scenario target guard", () => {
  it("allows the local Supabase CLI stack and a throwaway local database", () => {
    expect(
      assertScenarioTargetAllowed({
        DATABASE_URL: LOCAL,
        DIRECT_URL: LOCAL,
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toEqual({ host: "127.0.0.1", port: "54322", database: "postgres" });
    expect(
      assertScenarioTargetAllowed({
        DATABASE_URL: "postgres://u:p@localhost:5433/overload_test",
      }).database,
    ).toBe("overload_test");
  });

  it.each([
    [
      "the production pooler",
      {
        DATABASE_URL:
          "postgresql://postgres.abcdefghij:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      },
    ],
    [
      "a direct Supabase host",
      {
        DATABASE_URL:
          "postgresql://postgres:secret@db.abcdefghij.supabase.co:5432/postgres",
      },
    ],
    [
      "any other remote host",
      { DATABASE_URL: "postgresql://u:p@10.0.0.5:5432/db" },
    ],
    [
      "a local DB with a remote DIRECT_URL (mixed env file)",
      {
        DATABASE_URL: LOCAL,
        DIRECT_URL:
          "postgresql://postgres:secret@db.abcdefghij.supabase.co:5432/postgres",
      },
    ],
    [
      "a local DB with the cloud app URL",
      {
        DATABASE_URL: LOCAL,
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghij.supabase.co",
      },
    ],
    ["a production runtime", { DATABASE_URL: LOCAL, NODE_ENV: "production" }],
    ["a Vercel runtime", { DATABASE_URL: LOCAL, VERCEL: "1" }],
    [
      "a Vercel preview runtime",
      { DATABASE_URL: LOCAL, VERCEL_ENV: "preview" },
    ],
  ])("refuses %s", (_label, env) => {
    expect(() => assertScenarioTargetAllowed(env)).toThrow(
      ScenarioTargetRefused,
    );
  });

  it.each([
    ["no DATABASE_URL", {}],
    ["an unparseable DATABASE_URL", { DATABASE_URL: "not a url" }],
    ["a non-Postgres URL", { DATABASE_URL: "mysql://root@127.0.0.1:3306/db" }],
  ])("fails safe with %s", (_label, env) => {
    expect(() => assertScenarioTargetAllowed(env)).toThrow(
      ScenarioTargetRefused,
    );
  });

  it("has no override switch", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "scripts", "scenarios", "guard.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/CONFIRM|FORCE|OVERRIDE|ALLOW_REMOTE/);
  });
});

describe("determinism and relative dates", () => {
  it("stable ids are UUIDs and repeat for the same key", () => {
    const a = stableId("established", "2026-10-12", "meso", "b1");
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(stableId("established", "2026-10-12", "meso", "b1")).toBe(a);
    expect(stableId("established", "2026-10-13", "meso", "b1")).not.toBe(a);
  });

  it("the seeded generator repeats", () => {
    const a = seededRandom("x");
    const b = seededRandom("x");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  /** Every ISO date inside a facts object, in traversal order. */
  const dates = (facts: ScenarioFacts): string[] =>
    JSON.stringify(facts).match(/\d{4}-\d{2}-\d{2}/g) ?? [];

  it.each(SCENARIOS.map((s) => [s.key]))(
    "%s: the same anchor builds the same facts; another anchor shifts every date",
    (key) => {
      const s = findScenario(key)!;
      expect(s.build("2026-10-12")).toEqual(s.build("2026-10-12"));
      const a = dates(s.build("2026-10-12"));
      const b = dates(s.build("2026-11-23")); // 42 days later
      expect(b).toEqual(a.map((d) => addDays(d, 42)));
    },
  );

  it.each(SCENARIOS.map((s) => [s.key]))(
    "%s: nothing is logged on or after the anchor",
    (key) => {
      const facts = findScenario(key)!.build("2026-10-12");
      for (const w of facts.workouts)
        expect(w.scheduledFor < "2026-10-12").toBe(true);
      for (const c of facts.cardioLogs)
        expect(c.scheduledFor < "2026-10-12").toBe(true);
    },
  );
});

describe("plateau facts meet the real engine for the right reasons", () => {
  const anchor = "2026-10-12";
  const facts = findScenario("plateau")!.build(anchor);
  const meso = facts.mesocycles[0];

  function performances(
    ex: string,
    ignoreScheduledDeload = false,
  ): Performance[] {
    return facts.workouts.flatMap((w) => {
      const session = meso.sessions.find((s) => s.key === w.session)!;
      const slot = session.slots.find((s) => s.ex === ex);
      const done = w.exercises.find((e) => e.ex === ex);
      if (!slot || !done) return [];
      const week = mesocycleWeekForDate(meso.startIso, w.scheduledFor)!;
      return [
        {
          loggedExerciseId: `${ex}-${w.scheduledFor}`,
          dateIso: w.scheduledFor,
          week,
          scheduledDeload:
            !ignoreScheduledDeload &&
            isScheduledDeloadWeek(week, meso.deloadEveryWeeks),
          gymId: "downtown",
          complete: true,
          repMin: slot.repMin,
          repMax: slot.repMax,
          workingSets: done.sets.map((s, i) => ({ setNumber: i + 1, ...s })),
        },
      ];
    });
  }

  it.each(Object.entries(PLATEAU_EXPECTED))("%s → %s", (ex, expected) => {
    expect(evaluateReactive(performances(ex))).toBe(expected);
  });

  it("the Lat Pulldown hold exists only because the scheduled-deload week is excluded", () => {
    expect(evaluateReactive(performances("PULLDOWN"))).toBe("hold");
    expect(evaluateReactive(performances("PULLDOWN", true))).toBe("deload");
  });
});

describe("scenario tooling stays out of the application", () => {
  const REPO = path.join(__dirname, "..", "..");
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, acc);
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(full);
    }
    return acc;
  };
  const code = (f: string) =>
    fs
      .readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const files = walk(path.join(REPO, "scripts", "scenarios"));
  const scenarioCode = files.map(code);
  // The only modules that write to the database.
  const writers = files
    .filter((f) => /[\\/](write|reset)\.ts$/.test(f))
    .map(code);

  it("no application module imports the scenario tooling (no browser or server route can reach it)", () => {
    const offenders = walk(path.join(REPO, "src")).filter((f) =>
      /scripts\/scenarios|from\s+["'][^"']*scenarios/.test(
        fs.readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("never touches auth, Storage, RLS, or the schema", () => {
    for (const src of scenarioCode) {
      expect(src).not.toMatch(
        /@supabase|auth\.admin|createUser|INSERT\s+INTO\s+auth/i,
      );
      expect(src).not.toMatch(
        /migrate\s+reset|db\s+push|DROP\s+(TABLE|SCHEMA)|TRUNCATE|POLICY|ROW\s+LEVEL/i,
      );
    }
  });

  it("never deletes or recreates library exercises", () => {
    for (const src of scenarioCode) {
      expect(src).not.toMatch(
        /\.exercise\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
      );
    }
  });

  it("writes no derived value: no tag, e1RM, trend, stall, suggestion, or goal percent", () => {
    expect(writers).toHaveLength(2);
    for (const src of writers) {
      expect(src).not.toMatch(
        /\b(progressionTag|e1rm|estimatedOneRepMax|percent|suggestedWeight|isStalled|needsDeload)\s*:/,
      );
    }
  });
});
