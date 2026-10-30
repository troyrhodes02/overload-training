import { randomUUID } from "node:crypto";
import {
  getAdminAccount,
  listAccounts,
  reactivateAccount,
  suspendAccount,
} from "@/lib/data/admin/accounts";
import { listAudit } from "@/lib/data/admin/audit-read";
import { sendAccountResetEmail } from "@/lib/data/admin/reset-email";
import { getAdminOverview } from "@/lib/data/admin/metrics";
import { adminActorFor } from "@/lib/data/admin/identity";
import { resolveAccountState, type Account } from "@/lib/data/account";
import { DomainError } from "@/lib/actions/result";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import { snapshotAccount } from "./isolation/support";
import { activePlan, library, startToday } from "./isolation/fixtures";
import { logSet } from "@/lib/logging/logged-sets";

/**
 * Admin accounts against a real database (Admin Center & Feedback, spec
 * §6.3, §9, §11, §14.2): the directory, the account page, suspend and
 * reactivate (atomic with exactly one audit entry, idempotent, never an
 * admin, never touching training data), the audit log's labels, and the
 * Overview on controlled data.
 */

const ADMIN_ID = "a0000000-0000-4000-8000-00000000ad02";
const saved = process.env.OVERLOAD_ADMIN_USER_IDS;
beforeAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
});
afterAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = saved;
});

const raw = () => getTestPrisma();
const actor = () => adminActorFor(ADMIN_ID, "UTC");

async function named(
  firstName: string,
  lastName: string,
  username: string,
  over: { timeZone?: string; createdAt?: Date; userId?: string } = {},
): Promise<Account> {
  const account = await createTestAccount(
    over.timeZone ?? "UTC",
    over.userId ?? randomUUID(),
  );
  await raw().profile.update({
    where: { userId: account.userId },
    data: {
      firstName,
      lastName,
      username,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
  return account;
}

let emails: Map<string, string>;
const emailSource = async () => emails;

describe("directory and account page", () => {
  let maya: Account;
  let jordan: Account;
  let admin: Account;

  beforeEach(async () => {
    admin = await named("William", "Rhodes", "wrhodes", { userId: ADMIN_ID });
    maya = await named("Maya", "Chen", "mayac", {
      createdAt: new Date("2026-09-03T15:00:00Z"),
    });
    jordan = await named("Jordan", "Lee", "jlee", {
      createdAt: new Date("2026-09-12T15:00:00Z"),
    });
    emails = new Map([
      [admin.userId, "william@example.test"],
      [maya.userId, "maya@example.test"],
      [jordan.userId, "jordan@example.test"],
    ]);
  });

  it("lists every account newest first with permitted metadata only", async () => {
    const list = await listAccounts(actor(), {}, emailSource);
    expect(list.total).toBe(3);
    expect(list.emailsAvailable).toBe(true);
    expect(list.rows.map((r) => r.username)).toEqual([
      "wrhodes",
      "jlee",
      "mayac",
    ]);
    expect(Object.keys(list.rows[0]).sort()).toEqual(
      [
        "email",
        "firstName",
        "id",
        "isAdmin",
        "lastActiveOn",
        "lastName",
        "signupOn",
        "status",
        "tour",
        "username",
      ].sort(),
    );
    expect(list.rows.find((r) => r.id === ADMIN_ID)?.isAdmin).toBe(true);
    expect(list.rows.find((r) => r.id === maya.userId)).toMatchObject({
      email: "maya@example.test",
      signupOn: "2026-09-03",
      tour: "not_yet",
      status: "active",
    });
  });

  it("searches name, username, and email case-insensitively, and filters by status", async () => {
    const by = async (q: string) =>
      (await listAccounts(actor(), { q }, emailSource)).rows.map(
        (r) => r.username,
      );
    expect(await by("MAYA")).toEqual(["mayac"]);
    expect(await by("jle")).toEqual(["jlee"]);
    expect(await by("jordan@")).toEqual(["jlee"]);
    expect(await by("zz")).toEqual([]);
    await suspendAccount(actor(), maya.userId);
    const suspended = await listAccounts(
      actor(),
      { status: "suspended" },
      emailSource,
    );
    expect(suspended.rows.map((r) => r.username)).toEqual(["mayac"]);
  });

  it("degrades to no emails when the sign-in system can't be read", async () => {
    const list = await listAccounts(actor(), {}, async () => {
      throw new Error("auth down");
    });
    expect(list.emailsAvailable).toBe(false);
    expect(list.rows.every((r) => r.email === null)).toBe(true);
  });

  it("the account page is null for a malformed or unknown id", async () => {
    expect(
      await getAdminAccount(actor(), "not-a-uuid", emailSource),
    ).toBeNull();
    expect(
      await getAdminAccount(actor(), randomUUID(), emailSource),
    ).toBeNull();
  });

  it("suspend: one audit row, status changed, training untouched, next request refused", async () => {
    const lib = await library();
    const plan = await activePlan(maya, lib, "M");
    const { les } = await startToday(maya, plan);
    await logSet(maya, {
      loggedExerciseId: les[0].id,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    const before = await snapshotAccount(maya.userId);

    expect(await suspendAccount(actor(), maya.userId)).toEqual({
      changed: true,
    });
    expect((await resolveAccountState(maya.userId)).status).toBe("suspended");
    const audit = await raw().adminAuditEntry.findMany();
    expect(audit).toEqual([
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        kind: "account_suspend",
        targetUserId: maya.userId,
        feedbackId: null,
      }),
    ]);

    // A repeat changes nothing and records nothing.
    expect(await suspendAccount(actor(), maya.userId)).toEqual({
      changed: false,
    });
    expect(await raw().adminAuditEntry.count()).toBe(1);

    const page = await getAdminAccount(actor(), maya.userId, emailSource);
    expect(page).toMatchObject({
      status: "suspended",
      suspendedSince: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      feedbackCount: 0,
    });
    expect(page?.audit.map((l) => [l.kind, l.actorName])).toEqual([
      ["account_suspend", "William Rhodes"],
    ]);

    expect(await reactivateAccount(actor(), maya.userId)).toEqual({
      changed: true,
    });
    expect((await resolveAccountState(maya.userId)).status).toBe("active");
    expect(await raw().adminAuditEntry.count()).toBe(2);

    // Every training row is exactly as it was (only the profile's status and
    // updatedAt moved).
    const after = await snapshotAccount(maya.userId);
    const strip = (snap: Record<string, unknown[]>) =>
      Object.fromEntries(
        Object.entries(snap).filter(([table]) => table !== "profiles"),
      );
    expect(strip(after)).toEqual(strip(before));
  });

  it("refuses to suspend an admin account, and an unknown or malformed id, recording nothing", async () => {
    await expect(suspendAccount(actor(), ADMIN_ID)).rejects.toEqual(
      new DomainError(
        "invalid_state_transition",
        "Admin accounts can't be suspended here.",
      ),
    );
    await expect(suspendAccount(actor(), randomUUID())).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(suspendAccount(actor(), "x")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(reactivateAccount(actor(), jordan.userId)).resolves.toEqual({
      changed: false,
    });
    expect(await raw().adminAuditEntry.count()).toBe(0);
    expect((await resolveAccountState(ADMIN_ID)).status).toBe("active");
  });

  it("an actor no longer on the allowlist can do nothing", async () => {
    const stale = actor();
    process.env.OVERLOAD_ADMIN_USER_IDS = "";
    try {
      await expect(suspendAccount(stale, maya.userId)).rejects.toThrow(
        "Not an admin.",
      );
      await expect(listAccounts(stale, {}, emailSource)).rejects.toThrow(
        "Not an admin.",
      );
    } finally {
      process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
    }
    expect((await resolveAccountState(maya.userId)).status).toBe("active");
  });

  it("'Suspended since' survives many later admin actions on the account (review of #94)", async () => {
    await suspendAccount(actor(), maya.userId);
    for (let i = 0; i < 12; i++) {
      await raw().adminAuditEntry.create({
        data: {
          actorUserId: ADMIN_ID,
          kind: "feedback_handled",
          targetUserId: maya.userId,
          feedbackId: randomUUID(),
        },
      });
    }
    const page = await getAdminAccount(actor(), maya.userId, emailSource);
    expect(page?.audit).toHaveLength(10);
    expect(page?.audit.some((l) => l.kind === "account_suspend")).toBe(false);
    expect(page?.suspendedSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the audit log names accounts, and a removed account reads as deleted", async () => {
    await suspendAccount(actor(), maya.userId);
    await raw().adminAuditEntry.create({
      data: {
        actorUserId: ADMIN_ID,
        kind: "account_reactivate",
        targetUserId: randomUUID(), // an account that no longer exists
      },
    });
    const log = await listAudit(actor(), {}, emailSource);
    expect(log.lines.map((l) => [l.kind, l.target.label])).toEqual([
      ["account_reactivate", null],
      ["account_suspend", "Maya Chen"],
    ]);
    const mine = await listAudit(
      actor(),
      { account: maya.userId },
      emailSource,
    );
    expect(mine.lines).toHaveLength(1);
    expect(mine.account).toEqual({ id: maya.userId, label: "Maya Chen" });
  });
});

describe("admin send reset email (Public Accounts §9, R8)", () => {
  let maya: Account;

  beforeEach(async () => {
    await named("William", "Rhodes", "wrhodes", { userId: ADMIN_ID });
    maya = await named("Maya", "Chen", "mayac");
    emails = new Map([[maya.userId, "maya@example.test"]]);
  });

  it("an admin triggers the send and writes exactly one audit entry in the same tx", async () => {
    const sent: string[] = [];
    const send = async (email: string) => {
      sent.push(email);
    };

    const result = await sendAccountResetEmail(
      actor(),
      maya.userId,
      emailSource,
      send,
    );
    expect(result).toEqual({ sent: true, email: "maya@example.test" });
    expect(sent).toEqual(["maya@example.test"]);

    const audit = await raw().adminAuditEntry.findMany();
    expect(audit).toEqual([
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        kind: "account_reset_email_sent",
        targetUserId: maya.userId,
        feedbackId: null,
        detail: null,
      }),
    ]);
    // Who/what/which account/when: the entry carries an instant.
    expect(audit[0].createdAt).toBeInstanceOf(Date);

    // The new line shows on the account page as a human-labeled action.
    const page = await getAdminAccount(actor(), maya.userId, emailSource);
    expect(page?.audit.map((l) => [l.kind, l.actorName])).toEqual([
      ["account_reset_email_sent", "William Rhodes"],
    ]);
  });

  it("a non-admin (off the allowlist) sends nothing and records nothing", async () => {
    const sent: string[] = [];
    const send = async (email: string) => {
      sent.push(email);
    };
    const stale = actor();
    process.env.OVERLOAD_ADMIN_USER_IDS = "";
    try {
      await expect(
        sendAccountResetEmail(stale, maya.userId, emailSource, send),
      ).rejects.toThrow("Not an admin.");
    } finally {
      process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
    }
    expect(sent).toEqual([]);
    expect(await raw().adminAuditEntry.count()).toBe(0);
  });

  it("an unknown or malformed target sends nothing and records nothing", async () => {
    const send = jest.fn(async () => {});
    await expect(
      sendAccountResetEmail(actor(), randomUUID(), emailSource, send),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      sendAccountResetEmail(actor(), "not-a-uuid", emailSource, send),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(send).not.toHaveBeenCalled();
    expect(await raw().adminAuditEntry.count()).toBe(0);
  });

  it("a failed send LEAVES the audit entry (the admin action is still recorded) and reports failure", async () => {
    // Review #2/#3: the audit entry is written and COMMITTED before the
    // external send. If the send then fails, the owner still triggered a reset,
    // so exactly one audit line remains and the call reports a failure (which
    // the action surfaces as "Couldn't send… Try again."). No un-audited send
    // can occur, and no send is held inside the DB transaction.
    const send = async () => {
      throw new Error("email service down");
    };
    await expect(
      sendAccountResetEmail(actor(), maya.userId, emailSource, send),
    ).rejects.toThrow("email service down");

    const audit = await raw().adminAuditEntry.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        kind: "account_reset_email_sent",
        targetUserId: maya.userId,
      }),
    );
  });

  it("sends to a suspended account without reactivating it, and exposes no training content", async () => {
    const lib = await library();
    const plan = await activePlan(maya, lib, "M");
    const { les } = await startToday(maya, plan);
    await logSet(maya, {
      loggedExerciseId: les[0].id,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    await suspendAccount(actor(), maya.userId);
    const before = await snapshotAccount(maya.userId);

    const sent: string[] = [];
    const result = await sendAccountResetEmail(
      actor(),
      maya.userId,
      emailSource,
      async (email) => {
        sent.push(email);
      },
    );

    // The result reveals nothing but the send and the address.
    expect(result).toEqual({ sent: true, email: "maya@example.test" });
    expect(Object.keys(result).sort()).toEqual(["email", "sent"]);
    expect(sent).toEqual(["maya@example.test"]);

    // Still suspended: a reset never bypasses suspension.
    expect((await resolveAccountState(maya.userId)).status).toBe("suspended");

    // Training is untouched (only the suspend entry + this reset entry exist).
    const after = await snapshotAccount(maya.userId);
    expect(after).toEqual(before);
    const kinds = (await raw().adminAuditEntry.findMany()).map((a) => a.kind);
    expect(kinds.sort()).toEqual([
      "account_reset_email_sent",
      "account_suspend",
    ]);
  });

  it("sends nothing when the sign-in system has no email for the target", async () => {
    const send = jest.fn(async () => {});
    const noEmails = async () => new Map<string, string>();
    await expect(
      sendAccountResetEmail(actor(), maya.userId, noEmails, send),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(send).not.toHaveBeenCalled();
    expect(await raw().adminAuditEntry.count()).toBe(0);
  });
});

describe("the Overview on controlled data (spec §9)", () => {
  it("equals the documented definitions", async () => {
    const now = new Date("2026-10-22T18:00:00Z");
    const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
    const lib = await library();

    const a = await named("A", "One", "a_one", {
      createdAt: new Date("2026-10-05T12:00:00Z"),
    });
    const b = await named("B", "Two", "b_two", {
      createdAt: new Date("2026-09-10T12:00:00Z"),
    });
    const c = await named("C", "Three", "c_three", {
      createdAt: new Date("2026-09-20T12:00:00Z"),
    });
    const d = await named("D", "Four", "d_four", {
      createdAt: new Date("2026-08-01T12:00:00Z"),
    });
    await named("E", "Five", "e_five", {
      createdAt: new Date("2026-10-21T12:00:00Z"),
    });
    await raw().profile.update({
      where: { userId: a.userId },
      data: { lastActiveOn: day("2026-10-22") },
    });
    await raw().profile.update({
      where: { userId: b.userId },
      data: { lastActiveOn: day("2026-10-10"), status: "suspended" },
    });
    await raw().profile.update({
      where: { userId: c.userId },
      data: { lastActiveOn: day("2026-09-20") }, // signup day only
    });
    await raw().profile.update({
      where: { userId: d.userId },
      data: { lastActiveOn: day("2026-09-01") },
    });
    // e: never seen.

    // a: a plan and a logged set. b: a draft plan only. c: an empty
    // in-progress session (a plan, no set).
    const pa = await activePlan(a, lib, "A");
    const sa = await startToday(a, pa);
    await logSet(a, {
      loggedExerciseId: sa.les[0].id,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    await activePlan(b, lib, "B", { activate: false });
    const pc = await activePlan(c, lib, "C");
    await startToday(c, pc);

    const o = await getAdminOverview(actor(), now);
    expect(o).toEqual({
      timeZone: "UTC",
      registered: 5,
      suspended: 1,
      active7: 1, // a
      active30: 2, // a, b
      newThisMonth: 2, // a, e
      withPlan: 3, // a, b, c
      loggedWorkout: 1, // a
      pct: { active7: 20, active30: 40, withPlan: 60, loggedWorkout: 20 },
      monthStart: "2026-10-01",
      cohorts: [
        {
          month: "2026-10",
          signedUp: 2,
          cameBack: 1,
          cameBackPct: 50,
          active30: 1,
          active30Pct: 50,
        },
        {
          month: "2026-09",
          signedUp: 2,
          cameBack: 1,
          cameBackPct: 50,
          active30: 1,
          active30Pct: 50,
        },
        {
          month: "2026-08",
          signedUp: 1,
          cameBack: 1,
          cameBackPct: 100,
          active30: 0,
          active30Pct: 0,
        },
        ...["2026-07", "2026-06", "2026-05"].map((month) => ({
          month,
          signedUp: 0,
          cameBack: null,
          cameBackPct: null,
          active30: null,
          active30Pct: null,
        })),
      ],
    });
  });
});
