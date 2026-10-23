import { randomUUID } from "node:crypto";
import {
  accountToday,
  resolveAccountState,
  touchLastActive,
} from "@/lib/data/account";
import { adminDb, inAdminTx } from "@/lib/data/admin/db";
import { AdminScopeError } from "@/lib/data/admin/gate";
import { recordAudit } from "@/lib/data/admin/audit";
import { adminActorFor, NotAdminError } from "@/lib/data/admin/identity";
import { addDays } from "@/lib/plan/calendar";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";

/**
 * Admin Center & Feedback foundation (spec §5–§8, §14.2): the append-only
 * audit log, the database CHECKs, the gated admin client against a real
 * database, the audit writer's transaction rule, account status, and the
 * date-only last-active rule.
 */

const ADMIN_ID = "a0000000-0000-4000-8000-00000000ad01";
const savedEnv = process.env.OVERLOAD_ADMIN_USER_IDS;
beforeAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
});
afterAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = savedEnv;
});

const raw = () => getTestPrisma();

async function auditRow(targetUserId = randomUUID()) {
  return raw().adminAuditEntry.create({
    data: { actorUserId: ADMIN_ID, kind: "account_suspend", targetUserId },
  });
}

describe("the audit log is append-only (database trigger)", () => {
  it("rejects UPDATE and DELETE from any path, raw SQL included", async () => {
    const row = await auditRow();
    await expect(
      raw().$executeRawUnsafe(
        `UPDATE "admin_audit_entries" SET "kind" = 'account_reactivate' WHERE "id" = $1::uuid`,
        row.id,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      raw().$executeRawUnsafe(
        `DELETE FROM "admin_audit_entries" WHERE "id" = $1::uuid`,
        row.id,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      raw().adminAuditEntry.deleteMany({ where: { id: row.id } }),
    ).rejects.toThrow();
    expect(
      await raw().adminAuditEntry.findUnique({ where: { id: row.id } }),
    ).toEqual(row);
  });

  it("detail is present exactly for recategorization, feedbackId exactly for feedback kinds", async () => {
    await expect(
      raw().adminAuditEntry.create({
        data: {
          actorUserId: ADMIN_ID,
          kind: "account_suspend",
          targetUserId: randomUUID(),
          detail: { from: "bug", to: "idea" },
        },
      }),
    ).rejects.toThrow();
    await expect(
      raw().adminAuditEntry.create({
        data: {
          actorUserId: ADMIN_ID,
          kind: "feedback_handled",
          targetUserId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      raw().adminAuditEntry.create({
        data: {
          actorUserId: ADMIN_ID,
          kind: "feedback_recategorized",
          targetUserId: randomUUID(),
          feedbackId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("feedback message CHECK", () => {
  it("accepts 1 and 2000 trimmed characters and rejects empty, untrimmed, and 2001", async () => {
    const account = await createTestAccount();
    for (const message of ["x", "y".repeat(2000)]) {
      await expect(
        account.db.feedback.create({
          data: { userId: account.userId, category: "other", message },
        }),
      ).resolves.toBeTruthy();
    }
    for (const message of ["", "   ", " padded ", "z".repeat(2001)]) {
      await expect(
        account.db.feedback.create({
          data: { userId: account.userId, category: "other", message },
        }),
      ).rejects.toThrow();
    }
  });
});

describe("the admin client is gated against the real database", () => {
  it("reads permitted metadata and refuses anything else", async () => {
    const account = await createTestAccount("America/Chicago");
    const rows = await adminDb().profile.findMany({
      select: { userId: true, timeZone: true, status: true },
    });
    expect(rows).toEqual([
      { userId: account.userId, timeZone: "America/Chicago", status: "active" },
    ]);
    await expect(
      adminDb().profile.findMany({
        select: { userId: true, appearance: true },
      } as never),
    ).rejects.toBeInstanceOf(AdminScopeError);
    await expect(
      (
        adminDb() as unknown as { gym: { count: () => Promise<number> } }
      ).gym.count(),
    ).rejects.toBeInstanceOf(AdminScopeError);
  });

  it("answers only 'which accounts have a row' for training models", async () => {
    const withPlan = await createTestAccount();
    await createTestAccount();
    await raw().mesocycle.create({
      data: {
        userId: withPlan.userId,
        name: "Hypertrophy Block 3",
        lengthWeeks: 5,
        deloadEveryWeeks: 5,
        splitType: "ppl",
      },
    });
    const ids = await adminDb().mesocycle.groupBy({ by: ["userId"] });
    expect(ids).toEqual([{ userId: withPlan.userId }]);
    await expect(
      adminDb().mesocycle.findMany({ select: { name: true } } as never),
    ).rejects.toBeInstanceOf(AdminScopeError);
  });
});

describe("recordAudit", () => {
  it("writes one entry inside the change's transaction", async () => {
    const actor = adminActorFor(ADMIN_ID, "UTC");
    const target = randomUUID();
    await inAdminTx((tx) =>
      recordAudit(tx, actor, {
        action: "account_suspend",
        targetUserId: target,
      }),
    );
    expect(
      await raw().adminAuditEntry.findMany({ where: { targetUserId: target } }),
    ).toEqual([
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        kind: "account_suspend",
        targetUserId: target,
        feedbackId: null,
        detail: null,
      }),
    ]);
  });

  it("refuses to run outside an inAdminTx transaction", async () => {
    const actor = adminActorFor(ADMIN_ID, "UTC");
    const entry = {
      action: "account_suspend",
      targetUserId: randomUUID(),
    } as const;
    await expect(recordAudit(adminDb() as never, actor, entry)).rejects.toThrow(
      /inside the transaction/,
    );
    // A transaction opened any other way is refused too.
    await expect(
      adminDb().$transaction((tx) => recordAudit(tx, actor, entry)),
    ).rejects.toThrow(/inside the transaction/);
    expect(await raw().adminAuditEntry.count()).toBe(0);
  });

  it("rolls back with the change when the transaction fails afterwards", async () => {
    const actor = adminActorFor(ADMIN_ID, "UTC");
    const account = await createTestAccount();
    await expect(
      inAdminTx(async (tx) => {
        await tx.profile.updateMany({
          where: { userId: account.userId },
          data: { status: "suspended" },
        });
        await recordAudit(tx, actor, {
          action: "account_suspend",
          targetUserId: account.userId,
        });
        throw new Error("injected failure");
      }),
    ).rejects.toThrow("injected failure");
    expect(await raw().adminAuditEntry.count()).toBe(0);
    expect(
      (
        await raw().profile.findUniqueOrThrow({
          where: { userId: account.userId },
        })
      ).status,
    ).toBe("active");
  });

  it("refuses an actor that is no longer on the allowlist", async () => {
    const actor = adminActorFor(ADMIN_ID, "UTC");
    process.env.OVERLOAD_ADMIN_USER_IDS = "";
    try {
      await expect(
        inAdminTx((tx) =>
          recordAudit(tx, actor, {
            action: "account_suspend",
            targetUserId: randomUUID(),
          }),
        ),
      ).rejects.toBeInstanceOf(NotAdminError);
    } finally {
      process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
    }
    expect(await raw().adminAuditEntry.count()).toBe(0);
  });
});

describe("account status and last-active (spec §7)", () => {
  it("a new account is active with no last-active date until its first touch", async () => {
    const account = await createTestAccount();
    const state = await resolveAccountState(account.userId);
    expect(state.status).toBe("active");
    expect(state.lastActiveOn).toBeNull();
  });

  it("reports suspension from the stored status", async () => {
    const account = await createTestAccount();
    await raw().profile.update({
      where: { userId: account.userId },
      data: { status: "suspended" },
    });
    expect((await resolveAccountState(account.userId)).status).toBe(
      "suspended",
    );
  });

  it("writes today's date once, in the account's timezone, and not again the same day", async () => {
    const account = await createTestAccount("Pacific/Auckland");
    const today = accountToday(account);
    await touchLastActive(account, null);
    const first = await raw().profile.findUniqueOrThrow({
      where: { userId: account.userId },
    });
    expect(first.lastActiveOn?.toISOString().slice(0, 10)).toBe(today);

    // Same day again: the stored date short-circuits; no write at all.
    const state = await resolveAccountState(account.userId);
    expect(state.lastActiveOn).toBe(today);
    await touchLastActive(account, state.lastActiveOn);
    // Even a stale caller (thinks nothing is stored) cannot write twice.
    await touchLastActive(account, null);
    const second = await raw().profile.findUniqueOrThrow({
      where: { userId: account.userId },
    });
    expect(second.updatedAt).toEqual(first.updatedAt);
  });

  it("advances an earlier date to today", async () => {
    const account = await createTestAccount();
    const today = accountToday(account);
    const lastWeek = addDays(today, -7);
    await raw().profile.update({
      where: { userId: account.userId },
      data: { lastActiveOn: new Date(`${lastWeek}T00:00:00.000Z`) },
    });
    await touchLastActive(account, lastWeek);
    expect((await resolveAccountState(account.userId)).lastActiveOn).toBe(
      today,
    );
  });
});
