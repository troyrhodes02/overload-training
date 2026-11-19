import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import { getExerciseProgression } from "@/lib/progression/queries";
import type { Account } from "@/lib/data/account";
import { getHistoryWeek } from "@/lib/logging/history-week";
import { getTodayDashboard, getWorkout } from "@/lib/logging/queries";
import { changeGym, startOrResumeWorkout } from "@/lib/logging/sessions";
import {
  DEMO_GYMS,
  DEMO_LIBRARY,
  DEMO_SESSIONS,
  DEMO_VARIANTS,
  VARIANT_LIBRARY,
  demoFixture,
  expectedCounts,
  type DemoExercise,
  type DemoVariant,
} from "../../scripts/demo/fixture";
import {
  DemoSeedConflict,
  executeDemoSeed,
  inspectDemoTarget,
} from "../../scripts/demo/seed";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";

/**
 * Public Landing Page & Changelog — L5 (OVE-100; spec §13, RD-16/RD-17;
 * pitch P21-AC3) against an embedded throwaway Postgres. The demo seed writes
 * the synthetic fixture into an EMPTY account through the app's own write
 * modules, in one transaction; a dry run (inspection) writes nothing; a
 * re-run is a no-op; any other data is refused; other accounts are untouched;
 * and the UNCHANGED engine reads the story the fixture promises.
 */

const EQUIPMENT: Record<DemoExercise, string> = {
  BENCH: "barbell",
  OHP: "barbell",
  INCLINE_DB: "dumbbell",
  PULLDOWN: "cable",
  CHEST_PRESS: "machine",
  CABLE_ROW: "cable",
  LATERAL: "dumbbell",
  SQUAT: "barbell",
  RDL: "barbell",
  LEG_PRESS: "machine",
  LEG_CURL: "machine",
};

async function seedLibrary(): Promise<Record<DemoExercise, string>> {
  const ids = {} as Record<DemoExercise, string>;
  for (const [key, sourceId] of Object.entries(DEMO_LIBRARY) as [
    DemoExercise,
    string,
  ][]) {
    const row = await getTestPrisma().exercise.upsert({
      where: { sourceId },
      create: {
        name: sourceId.replace(/_/g, " "),
        sourceId,
        primaryMuscle: "chest",
        equipmentType: EQUIPMENT[key] as never,
        isCustom: false,
      },
      update: {},
    });
    ids[key] = row.id;
  }
  return ids;
}

/** Every owned training row in the database, by table (for "untouched"). */
async function snapshot(userId: string) {
  const db = getTestPrisma();
  const where = { userId };
  return {
    gyms: await db.gym.findMany({ where, orderBy: { id: "asc" } }),
    mesocycles: await db.mesocycle.findMany({ where, orderBy: { id: "asc" } }),
    loggedSets: await db.loggedSet.findMany({ where, orderBy: { id: "asc" } }),
    baselines: await db.gymExerciseBaseline.findMany({
      where,
      orderBy: { id: "asc" },
    }),
  };
}

let library: Record<DemoExercise, string>;
let anchor: string;

beforeEach(async () => {
  library = await seedLibrary();
  anchor = todayIso("UTC");
});

async function seededAccount(): Promise<Account> {
  const account = await createTestAccount("UTC");
  await executeDemoSeed(account, anchor);
  return account;
}

it("an empty account inspects as empty, and inspecting writes nothing", async () => {
  const account = await createTestAccount("UTC");
  const before = await snapshot(account.userId);
  const inspection = await inspectDemoTarget(account);
  expect(inspection.state).toBe("empty");
  expect(inspection.expected).toEqual(expectedCounts());
  expect(await snapshot(account.userId)).toEqual(before);
});

it("seeds exactly the fixture's rows, all owned by the target account", async () => {
  const account = await seededAccount();
  const inspection = await inspectDemoTarget(account);
  expect(inspection.state).toBe("seeded");
  expect(inspection.counts).toEqual(expectedCounts());
  const gyms = await getTestPrisma().gym.findMany({
    where: { userId: account.userId },
    select: { name: true },
  });
  expect(gyms.map((g) => g.name).sort()).toEqual(
    Object.values(DEMO_GYMS)
      .map((g) => g.name)
      .sort(),
  );
});

it("a second run is a no-op and refuses to write again (idempotent)", async () => {
  const account = await seededAccount();
  const before = await snapshot(account.userId);
  await expect(executeDemoSeed(account, anchor)).rejects.toThrow(
    DemoSeedConflict,
  );
  expect(await snapshot(account.userId)).toEqual(before);
  expect((await inspectDemoTarget(account)).state).toBe("seeded");
});

it("refuses an account holding any other data, writing nothing", async () => {
  const account = await createTestAccount("UTC");
  await getTestPrisma().gym.create({
    data: { userId: account.userId, name: "Someone's real gym" },
  });
  const before = await snapshot(account.userId);
  expect((await inspectDemoTarget(account)).state).toBe("conflict");
  await expect(executeDemoSeed(account, anchor)).rejects.toThrow(
    DemoSeedConflict,
  );
  expect(await snapshot(account.userId)).toEqual(before);
});

it("leaves every other account's rows exactly as they were", async () => {
  const other = await createTestAccount("UTC");
  await getTestPrisma().gym.create({
    data: { userId: other.userId, name: "Other lifter's gym" },
  });
  const before = await snapshot(other.userId);
  await seededAccount();
  expect(await snapshot(other.userId)).toEqual(before);
});

it("the unchanged engine reads the fixture's story on the anchor date", async () => {
  const account = await seededAccount();
  const call = async (ex: DemoExercise, gymId?: string) =>
    (await getExerciseProgression(account, library[ex], gymId ?? null))!;

  const bench = await call("BENCH");
  expect(bench.state).toBe("progress");
  expect(bench.tag).toBe("progress");
  expect(bench.points.length).toBeGreaterThanOrEqual(8);

  expect((await call("OHP")).state).toBe("deload");
  expect((await call("INCLINE_DB")).state).toBe("hold");
});

it("the machine has a different working weight at each gym (per-gym baselines)", async () => {
  const account = await seededAccount();
  const db = getTestPrisma();
  const gyms = await db.gym.findMany({ where: { userId: account.userId } });
  const id = (name: string) => gyms.find((g) => g.name === name)!.id;
  const baseline = async (gymName: string) =>
    Number(
      (
        await db.gymExerciseBaseline.findFirstOrThrow({
          where: {
            userId: account.userId,
            gymId: id(gymName),
            exerciseId: library.CHEST_PRESS,
          },
        })
      ).weightLbs,
    );
  const northside = await baseline("Northside Strength");
  const riverside = await baseline("Riverside Fitness");
  expect(northside).not.toBe(riverside);
  expect(riverside).toBeGreaterThan(northside);
  // Free weights never get a per-gym baseline.
  expect(
    await db.gymExerciseBaseline.count({
      where: { userId: account.userId, exerciseId: library.BENCH },
    }),
  ).toBe(0);
});

it("leaves no missed day before the anchor (Today shows the plan, not a prompt)", async () => {
  const account = await seededAccount();
  const sessions = await getTestPrisma().loggedSession.findMany({
    where: { userId: account.userId },
    select: { scheduledFor: true, status: true },
  });
  expect(sessions.every((s) => s.status === "complete")).toBe(true);
  // Nothing is logged on or after the anchor.
  const latest = sessions
    .map((s) => s.scheduledFor.toISOString().slice(0, 10))
    .sort()
    .at(-1)!;
  expect(latest < anchor).toBe(true);
});

it("stays well inside its transaction budget on a remote database (OVE-212)", async () => {
  // The seed is one interactive transaction with a 180 s limit, and every
  // statement in it is a round trip: about 50–60 ms from a laptop to
  // overload-dev, so about 3,000 statements is the cliff. It needed 2,994
  // before OVE-212 and timed out; it needs about 2,300 now. Count them.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require("pg") as {
    Client: { prototype: { query: (...args: unknown[]) => unknown } };
  };
  const account = await createTestAccount("UTC");
  const original = pg.Client.prototype.query;
  let statements = 0;
  pg.Client.prototype.query = function (this: unknown, ...args: unknown[]) {
    statements += 1;
    return original.apply(this, args);
  };
  try {
    await executeDemoSeed(account, anchor);
  } finally {
    pg.Client.prototype.query = original;
  }
  expect(statements).toBeLessThan(2_500);
});

/**
 * Pitch 21f (OVE-219; spec §11): the fixture's variants. Each is the same
 * story arranged so one scenario is ready on the anchor date, written through
 * the same application modules in the same single transaction.
 */
describe("fixture variants", () => {
  /** The variant-only library exercises, as the catalog import files them. */
  async function seedVariantLibrary() {
    const ids = {} as Record<keyof typeof VARIANT_LIBRARY, string>;
    for (const [key, sourceId] of Object.entries(VARIANT_LIBRARY) as [
      keyof typeof VARIANT_LIBRARY,
      string,
    ][]) {
      const row = await getTestPrisma().exercise.upsert({
        where: { sourceId },
        create: {
          name: sourceId,
          sourceId,
          primaryMuscle: key === "CRUNCHES" ? "core" : "back",
          equipmentType: "bodyweight",
          isCustom: false,
        },
        update: {},
      });
      ids[key] = row.id;
    }
    return ids;
  }

  async function seeded(variant: DemoVariant): Promise<Account> {
    await seedVariantLibrary();
    const account = await createTestAccount("UTC");
    await executeDemoSeed(account, anchor, variant);
    return account;
  }

  /** Today's planned workout, started at a gym, as the card read sees it. */
  async function todaysCards(account: Account, gymName: string) {
    const db = getTestPrisma();
    const gym = await db.gym.findFirstOrThrow({
      where: { userId: account.userId, name: gymName },
    });
    const session = await db.session.findFirstOrThrow({
      where: {
        userId: account.userId,
        mesocycle: { status: "active" },
        dayOfWeek: isoWeekday(anchor),
      },
    });
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId: session.id,
      scheduledFor: anchor,
      gymId: gym.id,
    });
    const workout = (await getWorkout(account, loggedSessionId))!;
    return { session, workout, loggedSessionId, gymId: gym.id };
  }

  it("standard is the fixture it always was", () => {
    expect(expectedCounts()).toEqual(expectedCounts("standard"));
    expect(expectedCounts("standard")).toEqual({
      gyms: 2,
      mesocycles: 2,
      sessions: 8,
      sessionExercises: 22,
      loggedSessions: 32,
      loggedExercises: 88,
      loggedSets: 264,
      customExercises: 0,
      goals: 0,
      plannedCardio: 0,
      cardioLogs: 0,
    });
    expect(demoFixture().sessions).toBe(DEMO_SESSIONS);
    expect(demoFixture().gyms).toBe(DEMO_GYMS);
    // `standard` plans only the base library, in its own order.
    expect(demoFixture().library).toEqual(DEMO_LIBRARY);
  });

  it.each(DEMO_VARIANTS)(
    "%s seeds exactly its own rows, re-inspects as seeded, and fits the budget",
    async (variant) => {
      await seedVariantLibrary();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pg = require("pg") as {
        Client: { prototype: { query: (...args: unknown[]) => unknown } };
      };
      const account = await createTestAccount("UTC");
      const original = pg.Client.prototype.query;
      let statements = 0;
      pg.Client.prototype.query = function (this: unknown, ...args: unknown[]) {
        statements += 1;
        return original.apply(this, args);
      };
      try {
        await executeDemoSeed(account, anchor, variant);
      } finally {
        pg.Client.prototype.query = original;
      }
      // One transaction with a 180 s limit at about 50 ms a statement.
      expect(statements).toBeLessThan(2_500);

      const own = await inspectDemoTarget(account, variant);
      expect([own.state, own.counts]).toEqual([
        "seeded",
        expectedCounts(variant),
      ]);
      // Every workout is finished, and nothing is logged on the anchor.
      const sessions = await getTestPrisma().loggedSession.findMany({
        where: { userId: account.userId },
      });
      expect(sessions.every((s) => s.status === "complete")).toBe(true);
      expect(
        sessions.every(
          (s) => s.scheduledFor.toISOString().slice(0, 10) < anchor,
        ),
      ).toBe(true);
      // Seeding again writes nothing.
      const before = await snapshot(account.userId);
      await expect(executeDemoSeed(account, anchor, variant)).rejects.toThrow(
        DemoSeedConflict,
      );
      expect(await snapshot(account.userId)).toEqual(before);
    },
  );

  it("an account seeded with one variant is never mistaken for another", async () => {
    const account = await seeded("bodyweight");
    // Same row counts as `standard`, a different plan: not `standard`.
    expect(expectedCounts("bodyweight")).toEqual(expectedCounts("standard"));
    expect((await inspectDemoTarget(account, "standard")).state).toBe(
      "conflict",
    );
    for (const other of ["gym", "cardio"] as const) {
      expect((await inspectDemoTarget(account, other)).state).toBe("conflict");
    }
    const before = await snapshot(account.userId);
    await expect(executeDemoSeed(account, anchor, "standard")).rejects.toThrow(
      DemoSeedConflict,
    );
    expect(await snapshot(account.userId)).toEqual(before);
  });

  it("gym: today's machines differ by gym, the dumbbell lift doesn't, and a third gym is a first time", async () => {
    const account = await seeded("gym");
    const card = (
      w: Awaited<ReturnType<typeof todaysCards>>["workout"],
      ex: DemoExercise,
    ) => w.exercises.find((e) => e.performedExerciseId === library[ex])!;
    const db = getTestPrisma();
    const baselinesBefore = await db.gymExerciseBaseline.findMany({
      where: { userId: account.userId },
      orderBy: { id: "asc" },
    });

    const north = await todaysCards(account, "Northside Strength");
    expect(north.session.name).toBe("Upper B");
    expect(north.workout.gymLocked).toBe(false);
    expect([
      card(north.workout, "CHEST_PRESS").weightContext,
      card(north.workout, "CHEST_PRESS").suggestedWeightLbs,
      card(north.workout, "CABLE_ROW").suggestedWeightLbs,
      card(north.workout, "LATERAL").suggestedWeightLbs,
    ]).toEqual(["trusted", 130, 145, 25]);

    // The same workout, moved before any set: each gym has its own history.
    await changeGym(account, {
      loggedSessionId: north.loggedSessionId,
      gymId: (
        await db.gym.findFirstOrThrow({
          where: { userId: account.userId, name: "Riverside Fitness" },
        })
      ).id,
    });
    const river = (await getWorkout(account, north.loggedSessionId))!;
    expect([
      card(river, "CHEST_PRESS").weightContext,
      card(river, "CHEST_PRESS").suggestedWeightLbs,
      card(river, "CABLE_ROW").suggestedWeightLbs,
      // A dumbbell lift is the same lift at any gym.
      card(river, "LATERAL").suggestedWeightLbs,
      card(river, "LATERAL").gymName,
    ]).toEqual(["trusted", 160, 155, 25, null]);

    const harborGym = await db.gym.findFirstOrThrow({
      where: { userId: account.userId, name: "Harbor Barbell" },
    });
    expect(
      await db.loggedExercise.count({
        where: { userId: account.userId, gymId: harborGym.id },
      }),
    ).toBe(0);
    await changeGym(account, {
      loggedSessionId: north.loggedSessionId,
      gymId: harborGym.id,
    });
    const harbor = (await getWorkout(account, north.loggedSessionId))!;
    const firstTime = card(harbor, "CHEST_PRESS");
    expect([
      firstTime.weightContext === "trusted",
      firstTime.suggestedWeightLbs,
      firstTime.previousPerformance,
      firstTime.gymName,
    ]).toEqual([false, null, null, "Harbor Barbell"]);
    expect(card(harbor, "LATERAL").suggestedWeightLbs).toBe(25);
    // Reading and moving the gym wrote no baseline anywhere.
    expect(
      await db.gymExerciseBaseline.findMany({
        where: { userId: account.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(baselinesBefore);
  });

  it("bodyweight: today's workout has a bodyweight lift, an abs lift, and fixed targets, with history", async () => {
    const variantIds = await seedVariantLibrary();
    const account = await seeded("bodyweight");
    const { session, workout } = await todaysCards(
      account,
      "Northside Strength",
    );
    expect(session.name).toBe("Upper A");
    const by = (id: string) =>
      workout.exercises.find((e) => e.performedExerciseId === id)!;
    const pullups = by(variantIds.PULLUPS);
    expect([
      pullups.requiresExternalWeight,
      pullups.plannedRepRange,
      pullups.weightContext,
      pullups.suggestedWeightLbs,
      pullups.previousPerformance?.sets.map((s) => [s.weightLbs, s.reps]),
    ]).toEqual([
      false,
      { min: 8, max: 10 },
      "trusted",
      null,
      [
        [null, 10],
        [null, 10],
        [null, 9],
      ],
    ]);
    const crunches = by(variantIds.CRUNCHES);
    expect([crunches.requiresExternalWeight, crunches.plannedRepRange]).toEqual(
      [false, { min: 15, max: 15 }],
    );
    const incline = by(library.INCLINE_DB);
    expect([
      incline.requiresExternalWeight,
      incline.plannedRepRange,
      incline.weightContext,
      incline.suggestedWeightLbs,
    ]).toEqual([true, { min: 10, max: 10 }, "trusted", 60]);
    // Bodyweight sets are stored with no weight at all, never 0.
    const bodyweightSets = await getTestPrisma().loggedSet.findMany({
      where: {
        userId: account.userId,
        loggedExercise: {
          exerciseId: { in: [variantIds.PULLUPS, variantIds.CRUNCHES] },
        },
      },
    });
    expect(bodyweightSets).toHaveLength(48);
    expect(bodyweightSets.every((s) => s.weightLbs === null)).toBe(true);
  });

  it("cardio: cardio waits beside today's lifting, with logged and missed days behind it", async () => {
    const account = await seeded("cardio");
    const dashboard = await getTodayDashboard(account);
    expect(dashboard.kind).toBe("pending");
    const today = dashboard.kind === "pending" ? dashboard : null;
    expect([
      today?.sessionName,
      today?.cardio.map((c) => [c.planned, c.state, c.log]),
    ]).toEqual([
      "Upper A",
      [[{ type: "Incline Walk", durationMin: 20 }, "pending", null]],
    ]);
    const logs = await getTestPrisma().cardioLog.findMany({
      where: { userId: account.userId },
      orderBy: { scheduledFor: "asc" },
    });
    expect(
      logs.map((l) => [
        l.type,
        l.durationMin,
        l.plannedDurationMin,
        l.scheduledFor.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      ["Incline Walk", 20, 20, addDays(anchor, -21)],
      ["Bike", 30, 30, addDays(anchor, -19)],
      ["Incline Walk", 25, 20, addDays(anchor, -14)],
      ["Bike", 30, 30, addDays(anchor, -12)],
      ["Incline Walk", 20, 20, addDays(anchor, -7)],
    ]);
    // Last week's bike was never logged: History shows it missed.
    const lastWeek = await getHistoryWeek(account, addDays(anchor, -7));
    const cardio = lastWeek.view.kind === "active" ? lastWeek.view.cardio : [];
    expect(cardio.map((c) => [c.planned.type, c.state])).toEqual([
      ["Incline Walk", "complete"],
      ["Bike", "missed"],
    ]);
    // Cardio created no workout and no baseline of its own.
    expect(
      await getTestPrisma().loggedSession.count({
        where: { userId: account.userId },
      }),
    ).toBe(32);
  });
});
