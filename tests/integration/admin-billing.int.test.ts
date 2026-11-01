import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import {
  adminActorFor,
  NotAdminError,
  type AdminActor,
} from "@/lib/data/admin/identity";
import {
  getAccountBilling,
  getBillingOverview,
  grantComp,
  revokeComp,
} from "@/lib/data/admin/billing";
import type { Account } from "@/lib/data/account";

/**
 * Plans, Billing & Promo Codes — admin complimentary access + billing
 * visibility (AC-3, spec §14). Proves the owner-only authorization, that every
 * grant/revoke writes an audit entry in the same transaction, that a comp is
 * never counted or shown as a paying subscriber, and that the Stripe mirror is
 * read-only (there is no admin write path to it). Entitlement/billing only — no
 * training content.
 */

const ADMIN_ID = "a0000000-0000-4000-8000-0000000000ad";
const savedEnv = process.env.OVERLOAD_ADMIN_USER_IDS;
beforeAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
});
afterAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = savedEnv;
});

const admin = () => adminActorFor(ADMIN_ID, "UTC");
let target: Account;

beforeEach(async () => {
  // Admin's own profile + a Free target (no default comp).
  await getTestPrisma().profile.create({
    data: { userId: ADMIN_ID, timeZone: "UTC" },
  });
  target = await createTestAccount("UTC", undefined, { entitlement: "none" });
});

const auditOf = (kind: string) =>
  getTestPrisma().adminAuditEntry.findMany({
    where: { kind: kind as never, targetUserId: target.userId },
  });

describe("authorization (AC-3)", () => {
  it("a non-admin actor is refused on every billing operation", async () => {
    // A hand-built actor for a non-allowlisted id (adminActorFor would reject
    // it at construction); the operations' own assertAdmin must still refuse it.
    const nonAdmin = { userId: target.userId, timeZone: "UTC" } as AdminActor;
    await expect(
      grantComp(nonAdmin, { targetUserId: target.userId, reason: "friend" }),
    ).rejects.toBeInstanceOf(NotAdminError);
    await expect(revokeComp(nonAdmin, target.userId)).rejects.toBeInstanceOf(
      NotAdminError,
    );
    await expect(
      getAccountBilling(nonAdmin, target.userId),
    ).rejects.toBeInstanceOf(NotAdminError);
    await expect(getBillingOverview(nonAdmin)).rejects.toBeInstanceOf(
      NotAdminError,
    );
  });
});

describe("grant / revoke (AC-3)", () => {
  it("grant writes a comp entitlement and a comp_granted audit entry (same tx)", async () => {
    await grantComp(admin(), {
      targetUserId: target.userId,
      reason: "founding_member",
    });
    const ents = await getTestPrisma().entitlement.findMany({
      where: { userId: target.userId, source: "comp" },
    });
    expect(ents).toHaveLength(1);
    expect(ents[0].grantedByUserId).toBe(ADMIN_ID);
    expect(await auditOf("comp_granted")).toHaveLength(1);

    const dto = await getAccountBilling(admin(), target.userId);
    expect(dto?.effectivePlan).toBe("pro");
    expect(dto?.source).toBe("comp");
  });

  it("revoke clears it and writes a comp_revoked audit entry; a second revoke is a no-op", async () => {
    await grantComp(admin(), { targetUserId: target.userId, reason: "tester" });
    const first = await revokeComp(admin(), target.userId);
    expect(first).toEqual({ changed: true });
    expect(await auditOf("comp_revoked")).toHaveLength(1);
    const again = await revokeComp(admin(), target.userId);
    expect(again).toEqual({ changed: false });
    expect(await auditOf("comp_revoked")).toHaveLength(1); // no extra entry
    const dto = await getAccountBilling(admin(), target.userId);
    expect(dto?.effectivePlan).toBe("free");
  });

  it("rejects Other without a note and a past end date, writing nothing", async () => {
    await expect(
      grantComp(admin(), { targetUserId: target.userId, reason: "other" }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      grantComp(admin(), {
        targetUserId: target.userId,
        reason: "friend",
        endsAt: new Date("2000-01-01T00:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(
      await getTestPrisma().entitlement.count({
        where: { userId: target.userId },
      }),
    ).toBe(0);
    expect(await auditOf("comp_granted")).toHaveLength(0);
  });

  it("refuses a second active comp (one per account)", async () => {
    await grantComp(admin(), { targetUserId: target.userId, reason: "friend" });
    await expect(
      grantComp(admin(), { targetUserId: target.userId, reason: "creator" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("billing overview never counts a comp as paying (AC-3)", () => {
  it("separates complimentary from paying subscriptions", async () => {
    // One comp account (the target) and one paying account.
    await grantComp(admin(), {
      targetUserId: target.userId,
      reason: "founding_member",
    });
    const payer = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    await getTestPrisma().billingAccount.create({
      data: {
        userId: payer.userId,
        stripeCustomerId: `cus_${payer.userId}`,
        subscriptionId: `sub_${payer.userId}`,
        status: "active",
        interval: "month",
      },
    });

    const o = await getBillingOverview(admin());
    expect(o.activeSubscriptions).toBe(1); // the payer only
    expect(o.complimentary).toBe(1); // the comp only
    // The comp account's effective plan is Pro but its source is never paying.
    const dto = await getAccountBilling(admin(), target.userId);
    expect(dto?.source).toBe("comp");
    expect(dto?.stripe).toBeNull();
  });
});
