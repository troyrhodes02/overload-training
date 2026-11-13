import { todayIso } from "@overload/shared/plan/calendar";
import { getExerciseProgression } from "@/lib/progression/queries";
import type { Account } from "@/lib/data/account";
import {
  DEMO_GYMS,
  DEMO_LIBRARY,
  expectedCounts,
  type DemoExercise,
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
