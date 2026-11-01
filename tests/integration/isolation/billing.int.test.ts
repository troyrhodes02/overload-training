import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { AccountScopeError, unclassifiedModels } from "@/lib/data/scope";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";

/**
 * Cross-account isolation — Plans, Billing & Promo Codes (spec 19 §14, RD-14).
 * Entitlement, BillingAccount, and PromoRedemption are OWNED: B's scoped client
 * can't read, count, change, create, or delete A's billing rows, and a foreign
 * id reads as missing. WebhookEvent is deliberately UN-OWNED (a Stripe event
 * ledger with no userId): it has deny-all RLS and is unreachable from any
 * account's scoped client.
 */

let a: Account;
let b: Account;

const entRow = (userId: string) =>
  getTestPrisma().$queryRawUnsafe(
    `SELECT to_jsonb(t) AS row FROM "entitlements" t WHERE t.user_id = $1::uuid`,
    userId,
  );

beforeEach(async () => {
  // No default Pro comp: this suite controls A's entitlements and proves B has none.
  a = await createTestAccount("UTC", undefined, { entitlement: "none" });
  b = await createTestAccount("UTC", undefined, { entitlement: "none" });
  // Seed A with one of each owned billing row, through A's scoped client.
  await a.db.entitlement.create({
    data: {
      userId: a.userId,
      source: "comp",
      plan: "pro",
      startedAt: new Date(),
      compReason: "founding_member",
      grantedByUserId: a.userId,
    },
  });
  await a.db.billingAccount.create({
    data: { userId: a.userId, stripeCustomerId: `cus_${a.userId}` },
  });
  await a.db.promoRedemption.create({
    data: {
      userId: a.userId,
      code: "BLIZZY",
      couponId: "coupon_blizzy",
      redeemedAt: new Date(),
    },
  });
});

describe("Entitlement isolation", () => {
  it("B can't read, count, change, or delete A's entitlement", async () => {
    const before = await entRow(a.userId);
    expect(await b.db.entitlement.findMany()).toEqual([]);
    expect(await b.db.entitlement.count()).toBe(0);
    expect(await b.db.entitlement.count({ where: { userId: a.userId } })).toBe(
      0,
    );
    const updated = await b.db.entitlement.updateMany({
      where: { userId: a.userId },
      data: { revokedAt: new Date() },
    });
    expect(updated.count).toBe(0);
    const deleted = await b.db.entitlement.deleteMany({
      where: { userId: a.userId },
    });
    expect(deleted.count).toBe(0);
    expect(await entRow(a.userId)).toEqual(before);
  });

  it("B can't create an entitlement for A", async () => {
    await expect(
      b.db.entitlement.create({
        data: {
          userId: a.userId,
          source: "comp",
          plan: "pro",
          startedAt: new Date(),
        },
      }),
    ).rejects.toBeInstanceOf(AccountScopeError);
    // B resolving its own plan is unaffected by A's comp.
    expect(await b.db.entitlement.count()).toBe(0);
  });
});

describe("BillingAccount isolation", () => {
  it("B can't read, change, or detect A's Stripe mirror by id", async () => {
    expect(
      await b.db.billingAccount.findUnique({ where: { userId: a.userId } }),
    ).toBeNull();
    expect(await b.db.billingAccount.findMany()).toEqual([]);
    const updated = await b.db.billingAccount.updateMany({
      where: { userId: a.userId },
      data: { status: "canceled" },
    });
    expect(updated.count).toBe(0);
  });
});

describe("PromoRedemption isolation", () => {
  it("B can't read, count, or delete A's redemption", async () => {
    expect(await b.db.promoRedemption.findMany()).toEqual([]);
    expect(await b.db.promoRedemption.count()).toBe(0);
    const deleted = await b.db.promoRedemption.deleteMany({
      where: { userId: a.userId },
    });
    expect(deleted.count).toBe(0);
  });
});

describe("WebhookEvent (un-owned system table)", () => {
  it("exists with deny-all RLS and no policy", async () => {
    const [rls] = (await getTestPrisma().$queryRawUnsafe(
      `SELECT relrowsecurity AS on FROM pg_class WHERE relname = 'webhook_events'`,
    )) as { on: boolean }[];
    expect(rls.on).toBe(true);
    const policies = (await getTestPrisma().$queryRawUnsafe(
      `SELECT 1 FROM pg_policies WHERE tablename = 'webhook_events'`,
    )) as unknown[];
    expect(policies).toEqual([]);
  });

  it("has no foreign key, so it never blocks account deletion", async () => {
    const fks = (await getTestPrisma().$queryRawUnsafe(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'webhook_events'::regclass AND contype = 'f'`,
    )) as unknown[];
    expect(fks).toEqual([]);
  });

  it("is writable only through raw Prisma (bypassing RLS)", async () => {
    const id = `evt_${randomUUID()}`;
    await getTestPrisma().webhookEvent.create({
      data: { id, type: "customer.subscription.updated" },
    });
    const row = await getTestPrisma().webhookEvent.findUniqueOrThrow({
      where: { id },
    });
    expect(row.type).toBe("customer.subscription.updated");
  });

  it("is unreachable through any account's scoped client", async () => {
    const delegate = (a.db as unknown as Record<string, unknown>)
      .webhookEvent as { findMany: () => Promise<unknown> };
    await expect(delegate.findMany()).rejects.toBeInstanceOf(AccountScopeError);
  });
});

describe("scope classification stays complete", () => {
  it("leaves no model unclassified (owned, shared, admin-only, or un-owned system)", () => {
    expect(unclassifiedModels()).toEqual([]);
  });
});
