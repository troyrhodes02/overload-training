import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import {
  planCleanup,
  executeCleanup,
  formatPlan,
} from "../../scripts/operator/plan-import-cleanup/cleanup";

/**
 * Workout Plan Import & Review (OVE-109) — the OPERATOR cleanup script's planning
 * and execution logic, against the throwaway Postgres. This is the manual
 * stand-in for the reliable <=24h scheduled purge the repo's infrastructure
 * cannot guarantee (no scheduler/cron/queue — architecture non-goal).
 *
 * Proven here:
 *  - the plan is GLOBAL (operator task) across accounts, read-only;
 *  - execution purges expired-unconfirmed sessions and retries tombstones in one
 *    DB transaction + best-effort blob removal;
 *  - a FAILING blob removal leaves a retriable tombstone and NEVER undoes a
 *    confirmed plan;
 *  - the summary carries COUNTS ONLY (no user id, path, or content).
 */

const HOUR = 60 * 60 * 1000;

async function seed(
  account: Account,
  opts: {
    status: "uploaded" | "review" | "confirmed" | "discarded";
    expiresAt: Date;
    sourcesPurgedAt?: Date | null;
    withObject?: boolean;
  },
): Promise<string> {
  const prisma = getTestPrisma();
  const s = await prisma.importSession.create({
    data: {
      userId: account.userId,
      status: opts.status,
      sourceKind: "image",
      expiresAt: opts.expiresAt,
      sourcesPurgedAt: opts.sourcesPurgedAt ?? null,
    },
    select: { id: true },
  });
  if (opts.withObject) {
    await prisma.importSourcePart.create({
      data: {
        userId: account.userId,
        sessionId: s.id,
        position: 0,
        objectPath: `${account.userId}/${s.id}/0.png`,
        contentType: "image/png",
        sizeBytes: 10,
      },
    });
  }
  return s.id;
}

const noopRemove = async () => {};
const failingRemove = async () => {
  throw new Error("storage down");
};

describe("operator cleanup — plan (read-only, global)", () => {
  it("lists overdue-unconfirmed sessions and pending tombstones across accounts", async () => {
    const prisma = getTestPrisma();
    const a = await createTestAccount();
    const b = await createTestAccount();
    const overdueA = await seed(a, {
      status: "review",
      expiresAt: new Date(Date.now() - HOUR),
      withObject: true,
    });
    const tombB = await seed(b, {
      status: "confirmed",
      expiresAt: new Date(Date.now() - HOUR),
      sourcesPurgedAt: null,
      withObject: true,
    });
    // Not overdue, and a done-confirmed: neither should appear.
    await seed(a, {
      status: "uploaded",
      expiresAt: new Date(Date.now() + HOUR),
    });
    await seed(b, {
      status: "confirmed",
      expiresAt: new Date(Date.now() - HOUR),
      sourcesPurgedAt: new Date(),
    });

    const plan = await planCleanup(prisma, { now: new Date() });
    const overdueIds = plan.expiredUnconfirmed.map((s) => s.id);
    const tombIds = plan.pendingTombstones.map((s) => s.id);
    expect(overdueIds).toContain(overdueA);
    expect(tombIds).toContain(tombB);
    // formatPlan leaks no id/path — counts only.
    const text = formatPlan(plan);
    expect(text).not.toContain(a.userId);
    expect(text).not.toContain(overdueA);
    expect(text).toMatch(/expired unconfirmed sessions: \d+/);
  });
});

describe("operator cleanup — execute", () => {
  it("purges expired-unconfirmed and clears tombstones when removal succeeds", async () => {
    const prisma = getTestPrisma();
    const a = await createTestAccount();
    const overdue = await seed(a, {
      status: "review",
      expiresAt: new Date(Date.now() - HOUR),
      withObject: true,
    });
    const tomb = await seed(a, {
      status: "discarded",
      expiresAt: new Date(Date.now() - HOUR),
      sourcesPurgedAt: null,
      withObject: true,
    });
    const plan = await planCleanup(prisma, { now: new Date() });
    const result = await executeCleanup(prisma, plan, noopRemove, new Date());

    expect(result.purged).toBeGreaterThanOrEqual(1);
    expect(result.tombstonesCleared).toBeGreaterThanOrEqual(1);
    expect(result.objectsFailed).toBe(0);

    const purgedRow = await prisma.importSession.findUniqueOrThrow({
      where: { id: overdue },
    });
    expect(purgedRow.status).toBe("purged");
    expect(purgedRow.sourcesPurgedAt).not.toBeNull();
    expect(
      await prisma.importSourcePart.count({ where: { sessionId: overdue } }),
    ).toBe(0);
    const tombRow = await prisma.importSession.findUniqueOrThrow({
      where: { id: tomb },
    });
    expect(tombRow.sourcesPurgedAt).not.toBeNull();
  });

  it("a FAILING blob removal leaves a retriable tombstone and never undoes the confirmed plan", async () => {
    const prisma = getTestPrisma();
    const a = await createTestAccount();
    // A confirmed session with a real draft mesocycle reference is the strongest
    // case: a failed blob delete must NOT touch the plan.
    const meso = await prisma.mesocycle.create({
      data: {
        userId: a.userId,
        name: "kept plan",
        lengthWeeks: 4,
        deloadEveryWeeks: 4,
        splitType: "custom",
        status: "draft",
      },
      select: { id: true },
    });
    const { id: confirmed } = await prisma.importSession.create({
      data: {
        userId: a.userId,
        status: "confirmed",
        sourceKind: "image",
        expiresAt: new Date(Date.now() - HOUR),
        sourcesPurgedAt: null,
        mesocycleId: meso.id,
      },
      select: { id: true },
    });
    await prisma.importSourcePart.create({
      data: {
        userId: a.userId,
        sessionId: confirmed,
        position: 0,
        objectPath: `${a.userId}/${confirmed}/0.png`,
        contentType: "image/png",
        sizeBytes: 10,
      },
    });

    const plan = await planCleanup(prisma, { now: new Date() });
    const result = await executeCleanup(
      prisma,
      plan,
      failingRemove,
      new Date(),
    );
    expect(result.objectsFailed).toBeGreaterThanOrEqual(1);
    expect(result.tombstonesCleared).toBe(0);

    const row = await prisma.importSession.findUniqueOrThrow({
      where: { id: confirmed },
    });
    expect(row.sourcesPurgedAt).toBeNull(); // still a retriable tombstone
    expect(row.status).toBe("confirmed"); // plan intact
    expect(row.mesocycleId).toBe(meso.id); // plan reference intact
    // The plan itself is untouched.
    expect(
      await prisma.mesocycle.findUniqueOrThrow({ where: { id: meso.id } }),
    ).toMatchObject({ id: meso.id, status: "draft" });
  });

  it("never purges a confirmed session's status, even when overdue", async () => {
    const prisma = getTestPrisma();
    const a = await createTestAccount();
    const confirmed = await seed(a, {
      status: "confirmed",
      expiresAt: new Date(Date.now() - HOUR),
      sourcesPurgedAt: null,
      withObject: true,
    });
    const plan = await planCleanup(prisma, { now: new Date() });
    // The confirmed session appears only as a tombstone, never as expiredUnconfirmed.
    expect(plan.expiredUnconfirmed.map((s) => s.id)).not.toContain(confirmed);
    expect(plan.pendingTombstones.map((s) => s.id)).toContain(confirmed);
    await executeCleanup(prisma, plan, noopRemove, new Date());
    expect(
      (
        await prisma.importSession.findUniqueOrThrow({
          where: { id: confirmed },
        })
      ).status,
    ).toBe("confirmed");
  });
});
