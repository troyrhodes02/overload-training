import { randomUUID } from "node:crypto";
import { todayIso, addDays } from "@overload/shared/plan/calendar";
import { accountFor } from "@/lib/data/operator";
import type { Account } from "@/lib/data/account";
import { getTodayDashboard } from "@/lib/logging/queries";
import { getExerciseProgression } from "@/lib/progression/queries";
import { getGoalDetail } from "@/lib/goals/queries";
import {
  ACTIVE_BLOCK_START_DAYS_BEFORE_ANCHOR,
  QA_CUSTOM_EXERCISE,
  QA_LIBRARY,
  QA_TIME_ZONE,
  expectedCounts,
  type QaExercise,
} from "../../scripts/qa-fixture/fixture";
import {
  QaFixtureRefused,
  executeQaReset,
  fingerprintHashes,
  executeQaSeed,
  inspectQaTarget,
  qaFingerprint,
  verifyQaFixture,
} from "../../scripts/qa-fixture/qa";
import { QA_BASELINE_HASHES } from "../../scripts/qa-fixture/baseline";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";

/**
 * OVE-173 — the QA fixture against an embedded throwaway Postgres (never a
 * real database). Seed writes the baseline into an empty account; reset
 * deletes that account's training rows and writes the same baseline in one
 * transaction; verify is read-only. Every write goes through the app's own
 * write modules, so the unchanged engine reads the stories the fixture
 * promises, and nothing outside the designated account changes.
 */

const QA_EMAIL = { email: "overload-staging-tester@example.com" };

const EQUIPMENT: Record<Exclude<QaExercise, "LANDMINE">, string> = {
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
  PULLUPS: "bodyweight",
  DEADLIFT: "barbell",
};

async function seedLibrary(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const [key, sourceId] of Object.entries(QA_LIBRARY)) {
    const row = await getTestPrisma().exercise.upsert({
      where: { sourceId },
      create: {
        name: sourceId.replace(/_/g, " "),
        sourceId,
        primaryMuscle: "chest",
        equipmentType: EQUIPMENT[key as keyof typeof EQUIPMENT] as never,
        isCustom: false,
      },
      update: {},
    });
    ids[key] = row.id;
  }
  return ids;
}

/** Every row of one account across the tables a reset touches or keeps. */
async function snapshot(userId: string) {
  const db = getTestPrisma();
  const where = { userId };
  const by = { orderBy: { id: "asc" as const } };
  return {
    profile: await db.profile.findUnique({ where: { userId } }),
    gyms: await db.gym.findMany({ where, ...by }),
    mesocycles: await db.mesocycle.findMany({ where, ...by }),
    loggedSessions: await db.loggedSession.findMany({ where, ...by }),
    loggedSets: await db.loggedSet.findMany({ where, ...by }),
    baselines: await db.gymExerciseBaseline.findMany({ where, ...by }),
    goals: await db.goal.findMany({ where, ...by }),
    cardio: await db.cardioLog.findMany({ where, ...by }),
    entitlements: await db.entitlement.findMany({ where, ...by }),
    feedback: await db.feedback.findMany({ where, ...by }),
    imports: await db.importSession.findMany({ where, ...by }),
  };
}

let library: Record<string, string>;
let anchor: string;

beforeEach(async () => {
  library = await seedLibrary();
  anchor = todayIso(QA_TIME_ZONE);
});

/** A designated QA account with the baseline, re-read so its zone is current. */
async function seeded(): Promise<Account> {
  const account = await createTestAccount("UTC", randomUUID(), {
    entitlement: "none",
  });
  await executeQaSeed(account, QA_EMAIL, { anchorIso: anchor });
  return accountFor(account.userId);
}

describe("seed", () => {
  it("writes exactly the baseline into an empty account", async () => {
    const account = await seeded();
    const inspection = await inspectQaTarget(account);
    expect(inspection.counts).toEqual(expectedCounts());
    expect(account.timeZone).toBe(QA_TIME_ZONE);
    const v = await verifyQaFixture(account);
    expect(v.status).toBe("baseline");
    expect(v.anchorIso).toBe(anchor);
    expect(v.checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("refuses an account that already holds training data, writing nothing", async () => {
    const account = await seeded();
    const before = await snapshot(account.userId);
    await expect(
      executeQaSeed(account, QA_EMAIL, { anchorIso: anchor }),
    ).rejects.toThrow(QaFixtureRefused);
    expect(await snapshot(account.userId)).toEqual(before);
  });

  it("refuses an account whose email is not on a reserved test domain", async () => {
    const account = await createTestAccount("UTC");
    const before = await snapshot(account.userId);
    await expect(
      executeQaSeed(
        account,
        { email: "lifter@gmail.com" },
        { anchorIso: anchor },
      ),
    ).rejects.toThrow(/reserved test domain/);
    expect(await snapshot(account.userId)).toEqual(before);
  });
});

describe("the baseline the app reads", () => {
  it("Today opens on Upper A, ready to start, with no missed-day prompt", async () => {
    const account = await seeded();
    const today = await getTodayDashboard(account);
    expect(today.kind).toBe("pending");
    if (today.kind === "pending") {
      expect(today.sessionName).toBe("Upper A");
      expect(today.scheduledFor).toBe(anchor);
      expect(today.setsLogged).toBe(0);
    }
    const sessions = await getTestPrisma().loggedSession.findMany({
      where: { userId: account.userId },
      select: { scheduledFor: true, status: true },
    });
    expect(sessions.every((s) => s.status === "complete")).toBe(true);
    expect(
      sessions.every((s) => s.scheduledFor.toISOString().slice(0, 10) < anchor),
    ).toBe(true);
  });

  it("the unchanged engine says progress, hold, and deload where the fixture means it", async () => {
    const account = await seeded();
    const call = async (ex: string) =>
      (await getExerciseProgression(account, library[ex], null))!;
    const bench = await call("BENCH");
    expect(bench.state).toBe("progress");
    expect(bench.points.length).toBeGreaterThanOrEqual(8);
    expect((await call("OHP")).state).toBe("deload");
    expect((await call("INCLINE_DB")).state).toBe("hold");
  });

  it("history covers about eight weeks, with RIR, a bodyweight lift, a fixed target, and a custom exercise", async () => {
    const account = await seeded();
    const db = getTestPrisma();
    const where = { userId: account.userId };
    const sessions = await db.loggedSession.findMany({
      where,
      select: { scheduledFor: true },
    });
    const oldest = sessions
      .map((s) => s.scheduledFor.toISOString().slice(0, 10))
      .sort()[0];
    expect(oldest).toBe(addDays(anchor, -56));
    expect(
      await db.loggedSet.count({ where: { ...where, rir: { not: null } } }),
    ).toBeGreaterThan(0);
    // Pull-ups log reps only: the weight is NULL, never 0.
    const pullups = await db.loggedSet.findMany({
      where: { ...where, loggedExercise: { exerciseId: library.PULLUPS } },
      select: { weightLbs: true },
    });
    expect(pullups.length).toBeGreaterThan(0);
    expect(pullups.every((s) => s.weightLbs === null)).toBe(true);
    const fixed = await db.sessionExercise.findMany({
      where: { ...where, exerciseId: library.DEADLIFT },
      select: { targetRepMin: true, targetRepMax: true },
    });
    expect(
      fixed.every((f) => f.targetRepMin === 5 && f.targetRepMax === 5),
    ).toBe(true);
    const custom = await db.exercise.findMany({
      where: { ...where, isCustom: true },
      select: { name: true },
    });
    expect(custom.map((c) => c.name)).toEqual([QA_CUSTOM_EXERCISE.name]);
  });

  it("a machine has its own baseline at each gym; free weights have none", async () => {
    const account = await seeded();
    const db = getTestPrisma();
    const gyms = await db.gym.findMany({ where: { userId: account.userId } });
    const baseline = async (gymName: string) =>
      Number(
        (
          await db.gymExerciseBaseline.findFirstOrThrow({
            where: {
              userId: account.userId,
              gymId: gyms.find((g) => g.name === gymName)!.id,
              exerciseId: library.CHEST_PRESS,
            },
          })
        ).weightLbs,
      );
    expect(await baseline("Riverside Fitness")).toBeGreaterThan(
      await baseline("Northside Strength"),
    );
    expect(
      await db.gymExerciseBaseline.count({
        where: { userId: account.userId, exerciseId: library.BENCH },
      }),
    ).toBe(0);
  });

  it("goals: two active with progress, one reached, one archived by hand", async () => {
    const account = await seeded();
    const goals = await getTestPrisma().goal.findMany({
      where: { userId: account.userId },
      select: {
        id: true,
        status: true,
        archiveReason: true,
        exerciseId: true,
        gymId: true,
      },
    });
    const bench = goals.find((g) => g.exerciseId === library.BENCH)!;
    expect(bench.status).toBe("active");
    const detail = await getGoalDetail(account, bench.id);
    expect(detail).not.toBeNull();
    const machine = goals.find((g) => g.exerciseId === library.CHEST_PRESS)!;
    expect(machine.status).toBe("active");
    expect(machine.gymId).not.toBeNull();
    expect(
      goals.find((g) => g.exerciseId === library.SQUAT)!.archiveReason,
    ).toBe("completed");
    expect(goals.find((g) => g.exerciseId === library.OHP)!.archiveReason).toBe(
      "manual",
    );
  });

  it("Pro comes from one comp entitlement (reason tester), never a Stripe row", async () => {
    const account = await seeded();
    const db = getTestPrisma();
    const ents = await db.entitlement.findMany({
      where: { userId: account.userId },
    });
    expect(ents).toHaveLength(1);
    expect(ents[0]).toMatchObject({
      source: "comp",
      compReason: "tester",
      revokedAt: null,
    });
    expect(
      await db.billingAccount.count({ where: { userId: account.userId } }),
    ).toBe(0);
  });
});

describe("reset", () => {
  it("is deterministic: two resets, on the same day or on different days, give the same baseline", async () => {
    const account = await seeded();
    const first = await qaFingerprint(account);
    await executeQaReset(account, QA_EMAIL, { anchorIso: anchor });
    expect(await qaFingerprint(account)).toEqual(first);
    // Another day: every date moves with the anchor, nothing else changes.
    // (Yesterday, so the anchor is still today-or-earlier for the write path.)
    await executeQaReset(account, QA_EMAIL, { anchorIso: addDays(anchor, -1) });
    expect(await qaFingerprint(account)).toEqual(first);
    expect((await inspectQaTarget(account)).counts).toEqual(expectedCounts());
  });

  it("restores the baseline after a tester changed things, with no duplicates", async () => {
    const account = await seeded();
    const baseline = await qaFingerprint(account);
    const db = getTestPrisma();
    // A tester adds a gym, a custom exercise, and archives a goal.
    await db.gym.create({
      data: { userId: account.userId, name: "Hotel gym" },
    });
    await db.exercise.create({
      data: {
        userId: account.userId,
        name: "Tester's move",
        primaryMuscle: "core",
        equipmentType: "bodyweight",
        isCustom: true,
      },
    });
    expect((await verifyQaFixture(account)).status).toBe("drifted");
    await executeQaReset(account, QA_EMAIL, { anchorIso: anchor });
    await executeQaReset(account, QA_EMAIL, { anchorIso: anchor });
    expect(await qaFingerprint(account)).toEqual(baseline);
    expect((await inspectQaTarget(account)).counts).toEqual(expectedCounts());
    expect((await verifyQaFixture(account)).status).toBe("baseline");
  });

  it("never touches another account, the shared library, or the auth user's profile row", async () => {
    const other = await createTestAccount("UTC");
    await getTestPrisma().gym.create({
      data: { userId: other.userId, name: "Other lifter's gym" },
    });
    const account = await seeded();
    const otherBefore = await snapshot(other.userId);
    const libraryBefore = await getTestPrisma().exercise.findMany({
      where: { isCustom: false },
      orderBy: { id: "asc" },
    });
    const profileBefore = await getTestPrisma().profile.findUnique({
      where: { userId: account.userId },
      select: { userId: true, createdAt: true },
    });
    await executeQaReset(account, QA_EMAIL, { anchorIso: anchor });
    expect(await snapshot(other.userId)).toEqual(otherBefore);
    expect(
      await getTestPrisma().exercise.findMany({
        where: { isCustom: false },
        orderBy: { id: "asc" },
      }),
    ).toEqual(libraryBefore);
    expect(
      await getTestPrisma().profile.findUnique({
        where: { userId: account.userId },
        select: { userId: true, createdAt: true },
      }),
    ).toEqual(profileBefore);
  });

  it("keeps feedback, revoked or trial entitlements, and adds no second comp", async () => {
    const account = await seeded();
    const db = getTestPrisma();
    await db.feedback.create({
      data: { userId: account.userId, category: "bug", message: "QA note" },
    });
    await db.entitlement.create({
      data: {
        userId: account.userId,
        source: "trial",
        plan: "pro",
        startedAt: new Date("2026-01-01T00:00:00Z"),
        endsAt: new Date("2026-01-15T00:00:00Z"),
      },
    });
    await executeQaReset(account, QA_EMAIL, { anchorIso: anchor });
    expect(await db.feedback.count({ where: { userId: account.userId } })).toBe(
      1,
    );
    expect(
      await db.entitlement.count({ where: { userId: account.userId } }),
    ).toBe(2);
    expect(
      await db.entitlement.count({
        where: { userId: account.userId, source: "comp", revokedAt: null },
      }),
    ).toBe(1);
  });

  it("rolls back completely when anything fails after the deletes", async () => {
    const account = await seeded();
    const before = await snapshot(account.userId);
    await expect(
      executeQaReset(account, QA_EMAIL, {
        anchorIso: anchor,
        afterDelete: async () => {
          throw new Error("simulated failure mid-reset");
        },
      }),
    ).rejects.toThrow("simulated failure mid-reset");
    expect(await snapshot(account.userId)).toEqual(before);
  });

  it("rolls back when the baseline cannot be written (an archived library exercise)", async () => {
    const account = await seeded();
    const before = await snapshot(account.userId);
    const db = getTestPrisma();
    await db.exercise.update({
      where: { id: library.PULLUPS },
      data: { deletedAt: new Date() },
    });
    try {
      await expect(
        executeQaReset(account, QA_EMAIL, { anchorIso: anchor }),
      ).rejects.toThrow(/missing \(or has archived\) Pullups/);
      expect(await snapshot(account.userId)).toEqual(before);
    } finally {
      await db.exercise.update({
        where: { id: library.PULLUPS },
        data: { deletedAt: null },
      });
    }
  });

  /** A confirmed plan import of `userId` pointing at one of its blocks. */
  async function confirmedImport(userId: string, mesocycleId: string) {
    return getTestPrisma().importSession.create({
      data: {
        userId,
        status: "confirmed" as never,
        sourceKind: "text",
        expiresAt: new Date(Date.now() + 86_400_000),
        mesocycleId,
      },
    });
  }

  it("unlinks only this account's confirmed plan imports from its blocks, keeping the records (OVE-174)", async () => {
    const account = await seeded();
    const other = await seeded();
    const db = getTestPrisma();
    const blocks = await db.mesocycle.findMany({
      where: { userId: account.userId },
    });
    expect(blocks).toHaveLength(2);
    const ours = await Promise.all(
      blocks.map((b) => confirmedImport(account.userId, b.id)),
    );
    const otherBlock = await db.mesocycle.findFirstOrThrow({
      where: { userId: other.userId, status: "active" },
    });
    await confirmedImport(other.userId, otherBlock.id);
    const otherBefore = await snapshot(other.userId);

    expect((await inspectQaTarget(account)).importsHoldingABlock).toBe(2);
    const result = await executeQaReset(account, QA_EMAIL, {
      anchorIso: anchor,
    });
    expect(result.importsUnlinked).toBe(2);

    // The records survive, confirmed, with no linked plan.
    const after = await db.importSession.findMany({
      where: { id: { in: ours.map((i) => i.id) } },
    });
    expect(after).toHaveLength(2);
    for (const row of after) {
      expect(row.status).toBe("confirmed");
      expect(row.mesocycleId).toBeNull();
    }
    // The old blocks are gone; the baseline is back.
    expect(
      await db.mesocycle.count({
        where: { id: { in: blocks.map((b) => b.id) } },
      }),
    ).toBe(0);
    const v = await verifyQaFixture(await accountFor(account.userId));
    expect(v.status).toBe("baseline");
    expect(v.checks.filter((c) => !c.ok)).toEqual([]);
    // Another account's import (and everything else it owns) is untouched.
    expect(await snapshot(other.userId)).toEqual(otherBefore);
  });

  it("restores the plan-import links when the reset fails after unlinking", async () => {
    const account = await seeded();
    const db = getTestPrisma();
    const block = await db.mesocycle.findFirstOrThrow({
      where: { userId: account.userId, status: "active" },
    });
    await confirmedImport(account.userId, block.id);
    const before = await snapshot(account.userId);
    await expect(
      executeQaReset(account, QA_EMAIL, {
        anchorIso: anchor,
        afterDelete: async () => {
          throw new Error("boom after unlink");
        },
      }),
    ).rejects.toThrow("boom after unlink");
    expect(await snapshot(account.userId)).toEqual(before);
  });

  it("refuses a non-test email before deleting anything", async () => {
    const account = await seeded();
    const before = await snapshot(account.userId);
    await expect(
      executeQaReset(
        account,
        { email: "real.person@icloud.com" },
        { anchorIso: anchor },
      ),
    ).rejects.toThrow(QaFixtureRefused);
    expect(await snapshot(account.userId)).toEqual(before);
  });
});

describe("verify (read-only)", () => {
  it("reports empty, then baseline, then stale on a later day, and writes nothing", async () => {
    const empty = await createTestAccount("UTC");
    expect((await verifyQaFixture(empty)).status).toBe("empty");
    const account = await seeded();
    const before = await snapshot(account.userId);
    expect((await verifyQaFixture(account)).status).toBe("baseline");
    const tomorrow = new Date(Date.now() + 2 * 86_400_000);
    const later = await verifyQaFixture(account, tomorrow);
    expect(later.status).toBe("stale");
    expect(later.anchorIso).toBe(anchor);
    expect(await snapshot(account.userId)).toEqual(before);
  });

  it("reports drift when today's workout was started, naming the failed check", async () => {
    const account = await seeded();
    const db = getTestPrisma();
    const block = await db.mesocycle.findFirstOrThrow({
      where: { userId: account.userId, status: "active" },
      select: { startDate: true },
    });
    expect(block.startDate!.toISOString().slice(0, 10)).toBe(
      addDays(anchor, -ACTIVE_BLOCK_START_DAYS_BEFORE_ANCHOR),
    );
    const upperA = await db.session.findFirstOrThrow({
      where: {
        userId: account.userId,
        name: "Upper A",
        mesocycle: { status: "active" },
      },
    });
    await db.loggedSession.create({
      data: {
        userId: account.userId,
        mesocycleId: upperA.mesocycleId,
        sessionId: upperA.id,
        performedOn: new Date(),
        scheduledFor: new Date(`${anchor}T00:00:00.000Z`),
      },
    });
    const v = await verifyQaFixture(account);
    expect(v.status).toBe("drifted");
    expect(v.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "loggedSessions = " + expectedCounts().loggedSessions,
        "the anchor day's Upper A is not yet logged",
      ]),
    );
  });
});

describe("a missing designated account", () => {
  it("is refused before anything runs (no profile is ever created)", async () => {
    const id = randomUUID();
    await expect(accountFor(id)).rejects.toThrow(/no profile/);
    expect(await getTestPrisma().profile.count({ where: { userId: id } })).toBe(
      0,
    );
  });
});

describe("the value baseline", () => {
  it("a fresh seed matches the committed baseline hashes (scripts/qa-fixture/baseline.ts)", async () => {
    const account = await seeded();
    const actual = fingerprintHashes(await qaFingerprint(account));
    expect(Object.keys(QA_BASELINE_HASHES).length).toBeGreaterThan(0);
    // On a deliberate baseline change, copy these values into baseline.ts.
    expect(actual).toEqual(QA_BASELINE_HASHES);
  });

  it("an edited past set is drift even though no count changed", async () => {
    const account = await seeded();
    const db = getTestPrisma();
    const set = await db.loggedSet.findFirstOrThrow({
      where: { userId: account.userId, weightLbs: { not: null } },
    });
    await db.loggedSet.update({
      where: { id: set.id },
      data: { reps: set.reps + 1 },
    });
    const v = await verifyQaFixture(account);
    expect(v.status).toBe("drifted");
    expect(v.counts).toEqual(expectedCounts());
    expect(v.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual([
      "values: logged match the qa-v1 baseline",
    ]);
  });

  it("an expired comp is replaced, so the account is never left on Free", async () => {
    const account = await seeded();
    const db = getTestPrisma();
    await db.entitlement.updateMany({
      where: { userId: account.userId, source: "comp" },
      data: { endsAt: new Date(Date.now() - 86_400_000) },
    });
    expect(
      (await verifyQaFixture(account)).checks.find(
        (c) => c.name === "comp Pro is active",
      )!.ok,
    ).toBe(false);
    await executeQaReset(account, QA_EMAIL, { anchorIso: anchor });
    const comps = await db.entitlement.findMany({
      where: { userId: account.userId, source: "comp" },
    });
    expect(comps).toHaveLength(2);
    expect(
      comps.filter((c) => c.revokedAt === null && c.endsAt === null),
    ).toHaveLength(1);
    expect((await verifyQaFixture(account)).status).toBe("baseline");
  });
});
