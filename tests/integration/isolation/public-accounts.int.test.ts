import type { Account } from "@/lib/data/account";
import { AccountScopeError } from "@/lib/data/scope";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";

/**
 * Public Accounts, Recovery & Support — Foundation (PA1 / OVE-81; spec §7,
 * R5). The migration is additive and the new infrastructure keeps both
 * invariants: `Profile.emailVerifiedAt` is a scoped owned column (covered more
 * broadly by profile.int.test.ts), and `AuthThrottle` is an intentionally
 * un-owned, deny-all system table that holds no personal data and is
 * unreachable through the account-scoped client.
 */

let a: Account;

beforeEach(async () => {
  a = await createTestAccount();
});

describe("Profile.emailVerifiedAt (owned, scoped)", () => {
  it("defaults to NULL and is set only for the acting account through account.db", async () => {
    const before = await getTestPrisma().profile.findUniqueOrThrow({
      where: { userId: a.userId },
    });
    expect(before.emailVerifiedAt).toBeNull();

    const when = new Date();
    await a.db.profile.updateMany({ data: { emailVerifiedAt: when } });

    const after = await getTestPrisma().profile.findUniqueOrThrow({
      where: { userId: a.userId },
    });
    expect(after.emailVerifiedAt?.getTime()).toBe(when.getTime());
  });

  it("a second account cannot set the first account's emailVerifiedAt", async () => {
    const b = await createTestAccount();
    // B's scoped update intersects with B's own userId, so A's row is never
    // touched even though B names a timestamp.
    await b.db.profile.updateMany({ data: { emailVerifiedAt: new Date() } });
    const aRow = await getTestPrisma().profile.findUniqueOrThrow({
      where: { userId: a.userId },
    });
    expect(aRow.emailVerifiedAt).toBeNull();
  });
});

describe("AuthThrottle (un-owned system table)", () => {
  it("exists with deny-all RLS and no policy", async () => {
    const [rls] = (await getTestPrisma().$queryRawUnsafe(
      `SELECT relrowsecurity AS on FROM pg_class WHERE relname = 'auth_throttle'`,
    )) as { on: boolean }[];
    expect(rls.on).toBe(true);
    const policies = (await getTestPrisma().$queryRawUnsafe(
      `SELECT 1 FROM pg_policies WHERE tablename = 'auth_throttle'`,
    )) as unknown[];
    expect(policies).toEqual([]);
  });

  it("holds no personal data: only a key hash, an action, a window, and a count", async () => {
    const columns = (await getTestPrisma().$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'auth_throttle' ORDER BY column_name`,
    )) as { column_name: string }[];
    expect(columns.map((c) => c.column_name)).toEqual([
      "action",
      "count",
      "created_at",
      "key_hash",
      "updated_at",
      "window_start",
    ]);
  });

  it("has no foreign key, so it never blocks account deletion", async () => {
    const fks = (await getTestPrisma().$queryRawUnsafe(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'auth_throttle'::regclass AND contype = 'f'`,
    )) as unknown[];
    expect(fks).toEqual([]);
  });

  it("is writable only through raw Prisma (bypassing RLS), proving the migration applied", async () => {
    const windowStart = Math.floor(Date.now() / 1000);
    await getTestPrisma().authThrottle.create({
      data: {
        keyHash: "a".repeat(64),
        action: "signup",
        windowStart,
        count: 1,
      },
    });
    const row = await getTestPrisma().authThrottle.findUniqueOrThrow({
      where: {
        keyHash_action_windowStart: {
          keyHash: "a".repeat(64),
          action: "signup",
          windowStart,
        },
      },
    });
    expect(row.count).toBe(1);
  });

  it("is unreachable through any account's scoped client", async () => {
    const delegate = (a.db as unknown as Record<string, unknown>)
      .authThrottle as { findMany: () => Promise<unknown> };
    await expect(delegate.findMany()).rejects.toBeInstanceOf(AccountScopeError);
  });
});

describe("AdminAuditAction gains account_reset_email_sent", () => {
  it("the new enum value is usable on an admin audit entry", async () => {
    const { randomUUID } = await import("node:crypto");
    await getTestPrisma().adminAuditEntry.create({
      data: {
        actorUserId: randomUUID(),
        kind: "account_reset_email_sent",
        targetUserId: a.userId,
      },
    });
    const row = await getTestPrisma().adminAuditEntry.findFirstOrThrow({
      where: { kind: "account_reset_email_sent" },
    });
    expect(row.targetUserId).toBe(a.userId);
  });
});
