import { getAdminAccount, listAccounts } from "@/lib/data/admin/accounts";
import { adminActorFor, type AdminActor } from "@/lib/data/admin/identity";
import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";

/**
 * Workout Logging Refinements — the admin directory's Plan column (roadmap
 * chore "admin membership visibility"; spec RD-11). Every row carries Pro,
 * trial, Comped, or Free, resolved on read from entitlement and billing
 * records through the enforced resolver. Admin only; metadata only.
 */
const ADMIN_ID = "a0000000-0000-4000-8000-00000000ad24";
const saved = process.env.OVERLOAD_ADMIN_USER_IDS;
beforeAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
});
afterAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = saved;
});

const db = () => getTestPrisma();
const actor = () => adminActorFor(ADMIN_ID, "UTC");
const emails = async () => new Map<string, string>();
const DAY = 24 * 60 * 60 * 1000;

const plain = () =>
  createTestAccount("UTC", undefined, { entitlement: "none" });

async function subscribe(a: Account, over: Record<string, unknown> = {}) {
  await db().billingAccount.create({
    data: {
      userId: a.userId,
      stripeCustomerId: `cus_${a.userId}`,
      subscriptionId: `sub_${a.userId}`,
      status: "active",
      interval: "month",
      ...over,
    },
  });
}

async function trial(a: Account, endsInDays: number) {
  await db().entitlement.create({
    data: {
      userId: a.userId,
      source: "trial",
      plan: "pro",
      startedAt: new Date(Date.now() - 14 * DAY + endsInDays * DAY),
      endsAt: new Date(Date.now() + endsInDays * DAY),
    },
  });
}

async function comp(a: Account) {
  await db().entitlement.create({
    data: {
      userId: a.userId,
      source: "comp",
      plan: "pro",
      startedAt: new Date(Date.now() - DAY),
      compReason: "founding_member",
    },
  });
}

async function directory(): Promise<Map<string, string>> {
  const list = await listAccounts(actor(), {}, emails);
  return new Map(list.rows.map((r) => [r.id, r.membership]));
}

describe("the directory shows each account's plan", () => {
  it("Pro, trial, Comped, and Free, with subscription > comp > trial", async () => {
    const payer = await plain();
    await subscribe(payer);
    const onTrial = await plain();
    await trial(onTrial, 5);
    const comped = await plain();
    await comp(comped);
    const both = await plain(); // comp + paying subscription → Pro
    await comp(both);
    await subscribe(both);
    const trialAndComp = await plain(); // comp outranks a trial
    await trial(trialAndComp, 5);
    await comp(trialAndComp);
    const expired = await plain(); // a trial that ended → Free
    await trial(expired, -1);
    const lapsed = await plain(); // a canceled subscription → Free
    await subscribe(lapsed, { status: "canceled" });
    const canceling = await plain(); // still paid until period end → Pro
    await subscribe(canceling, { cancelAtPeriodEnd: true });
    const free = await plain();

    const m = await directory();
    expect(m.get(payer.userId)).toBe("pro");
    expect(m.get(onTrial.userId)).toBe("trial");
    expect(m.get(comped.userId)).toBe("comped");
    expect(m.get(both.userId)).toBe("pro");
    expect(m.get(trialAndComp.userId)).toBe("comped");
    expect(m.get(expired.userId)).toBe("free");
    expect(m.get(lapsed.userId)).toBe("free");
    expect(m.get(canceling.userId)).toBe("pro");
    expect(m.get(free.userId)).toBe("free");

    // The account page carries the same label.
    const page = await getAdminAccount(actor(), comped.userId, emails);
    expect(page?.membership).toBe("comped");
  });

  it("a non-admin cannot read the directory", async () => {
    const lifter = await plain();
    expect(() => adminActorFor(lifter.userId, "UTC")).toThrow();
    const forged = Object.freeze({
      userId: lifter.userId,
      timeZone: "UTC",
    }) as AdminActor;
    await expect(listAccounts(forged, {}, emails)).rejects.toThrow();
  });

  it("the row carries metadata only: no plan, set, gym, goal, or cardio field", async () => {
    const a = await plain();
    await comp(a);
    const row = (await listAccounts(actor(), {}, emails)).rows.find(
      (r) => r.id === a.userId,
    )!;
    expect(Object.keys(row).sort()).toEqual(
      [
        "email",
        "firstName",
        "id",
        "isAdmin",
        "lastActiveOn",
        "lastName",
        "membership",
        "signupOn",
        "status",
        "tour",
        "username",
      ].sort(),
    );
  });
});
