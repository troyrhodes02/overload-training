import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import {
  enforceSingleSubscription,
  reconcileStripeEvent,
  type EnforceDeps,
  type MirrorSnapshot,
  type OpenSubscription,
  type StripeEventInput,
} from "@/lib/data/billing-webhook";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import type { Account } from "@/lib/data/account";

/**
 * One subscription per account (OVE-112). Checkout prevention leaves one gap:
 * a lifter pays in one tab while another tab holds a newer Checkout session.
 * This proves the webhook closes it: the mirror keeps the first established
 * subscription (a duplicate's events never replace it), the duplicate is
 * refunded then canceled, leftover sessions are expired, replays are safe, and
 * the account ends with exactly one paid subscription. Stripe is a fake.
 */

const CUS = "cus_dup_1";
const DAY = 24 * 60 * 60 * 1000;
let account: Account;

/** A fake Stripe holding the customer's subscriptions by id. */
function fakeStripe() {
  const subs = new Map<string, MirrorSnapshot & { invoice: string | null }>();
  const calls: string[] = [];
  const add = (id: string, over: Partial<MirrorSnapshot> = {}) =>
    subs.set(id, {
      subscriptionId: id,
      customerId: CUS,
      status: "active",
      interval: "month",
      currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      cancelAtPeriodEnd: false,
      priceId: "price_monthly",
      promo: null,
      invoice: `in_${id}`,
      ...over,
    });
  const getSubscription = async (
    id: string,
  ): Promise<MirrorSnapshot | null> => {
    const s = subs.get(id);
    if (!s) return null;
    return {
      subscriptionId: s.subscriptionId,
      customerId: s.customerId,
      status: s.status,
      interval: s.interval,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      priceId: s.priceId,
      promo: s.promo,
    };
  };

  const enforce: EnforceDeps = {
    async listOpenSubscriptions() {
      return [...subs.values()]
        .filter((s) => s.status !== "canceled")
        .map((s): OpenSubscription => ({
          id: s.subscriptionId,
          status: s.status,
          latestInvoiceId: s.invoice,
        }));
    },
    async refundInvoice(invoiceId) {
      calls.push(`refund:${invoiceId}`);
      return 1;
    },
    async cancelSubscription(id) {
      calls.push(`cancel:${id}`);
      subs.get(id)!.status = "canceled";
    },
    async expireOpenCheckoutSessions() {
      calls.push("expire");
      return 1;
    },
  };
  return { subs, calls, add, getSubscription, enforce };
}

let n = 0;
const evt = (
  type: string,
  object: Record<string, unknown>,
): StripeEventInput => ({ id: `evt_dup_${++n}`, type, object });
const subEvent = (type: string, id: string) => evt(type, { id, customer: CUS });
const checkoutDone = (subId: string) =>
  evt("checkout.session.completed", {
    customer: CUS,
    subscription: subId,
    client_reference_id: account.userId,
  });

const mirror = () =>
  getTestPrisma().billingAccount.findUniqueOrThrow({
    where: { userId: account.userId },
  });

beforeEach(async () => {
  account = await createTestAccount("UTC", undefined, { entitlement: "none" });
  // The customer link startCheckout writes before any Checkout.
  await getTestPrisma().billingAccount.create({
    data: { userId: account.userId, stripeCustomerId: CUS },
  });
});

describe("the mirror keeps one subscription", () => {
  it("a second established subscription's events never replace the first", async () => {
    const s = fakeStripe();
    s.add("sub_A");
    s.add("sub_B");
    const deps = { getSubscription: s.getSubscription };
    await reconcileStripeEvent(checkoutDone("sub_A"), deps);
    await expect(
      reconcileStripeEvent(checkoutDone("sub_B"), deps),
    ).resolves.toEqual({ status: "ignored", reason: "duplicate_subscription" });
    await reconcileStripeEvent(
      subEvent("customer.subscription.updated", "sub_B"),
      deps,
    );
    expect((await mirror()).subscriptionId).toBe("sub_A");
  });

  it("a genuine resubscription after the old one ended is accepted", async () => {
    const s = fakeStripe();
    s.add("sub_A");
    const deps = { getSubscription: s.getSubscription };
    await reconcileStripeEvent(checkoutDone("sub_A"), deps);
    s.subs.get("sub_A")!.status = "canceled";
    await reconcileStripeEvent(
      subEvent("customer.subscription.deleted", "sub_A"),
      deps,
    );
    s.add("sub_B");
    await reconcileStripeEvent(checkoutDone("sub_B"), deps);
    expect(await mirror()).toMatchObject({
      subscriptionId: "sub_B",
      status: "active",
    });
  });

  it("a stale 'active' mirror (deletion webhook missed) doesn't block a resubscription", async () => {
    const s = fakeStripe();
    s.add("sub_A");
    const deps = { getSubscription: s.getSubscription };
    await reconcileStripeEvent(checkoutDone("sub_A"), deps);
    s.subs.get("sub_A")!.status = "canceled"; // no webhook delivered for it
    s.add("sub_B");
    await reconcileStripeEvent(checkoutDone("sub_B"), deps);
    expect((await mirror()).subscriptionId).toBe("sub_B");
  });

  it("a paid subscription replaces one whose first payment never completed", async () => {
    const s = fakeStripe();
    s.add("sub_A", { status: "incomplete" });
    s.add("sub_B");
    const deps = { getSubscription: s.getSubscription };
    await reconcileStripeEvent(checkoutDone("sub_A"), deps);
    await reconcileStripeEvent(checkoutDone("sub_B"), deps);
    expect(await mirror()).toMatchObject({
      subscriptionId: "sub_B",
      status: "active",
    });
  });

  it("a late event for an old, ended subscription can't flip the mirror back", async () => {
    const s = fakeStripe();
    s.add("sub_A", { status: "canceled" });
    s.add("sub_B");
    const deps = { getSubscription: s.getSubscription };
    await reconcileStripeEvent(checkoutDone("sub_B"), deps);
    await expect(
      reconcileStripeEvent(
        subEvent("customer.subscription.deleted", "sub_A"),
        deps,
      ),
    ).resolves.toMatchObject({ reason: "duplicate_subscription" });
    expect(await mirror()).toMatchObject({
      subscriptionId: "sub_B",
      status: "active",
    });
  });

  it("concurrent first events for two subscriptions leave exactly one in the mirror", async () => {
    const s = fakeStripe();
    s.add("sub_A");
    s.add("sub_B");
    const deps = { getSubscription: s.getSubscription };
    const out = await Promise.all([
      reconcileStripeEvent(checkoutDone("sub_A"), deps),
      reconcileStripeEvent(checkoutDone("sub_B"), deps),
    ]);
    const statuses = out.map((o) => o.status).sort();
    expect(statuses).toEqual(["ignored", "processed"]);
    expect(["sub_A", "sub_B"]).toContain((await mirror()).subscriptionId);
  });
});

describe("the duplicate is refunded and canceled", () => {
  it("two tabs both paid: the account ends with one paid subscription and a refund", async () => {
    const s = fakeStripe();
    const deps = { getSubscription: s.getSubscription };

    // Tab A pays first; its webhook lands.
    s.add("sub_A");
    const a = checkoutDone("sub_A");
    await reconcileStripeEvent(a, deps);
    await enforceSingleSubscription(a, s.enforce);
    expect(s.calls).toEqual(["expire"]); // leftover sessions expired; nothing to cancel

    // Tab B had a session open and pays it anyway.
    s.add("sub_B");
    const b = checkoutDone("sub_B");
    await reconcileStripeEvent(b, deps);
    const out = await enforceSingleSubscription(b, s.enforce);
    expect(out).toMatchObject({ refunded: ["sub_B"], canceled: ["sub_B"] });
    // Refund strictly before cancel.
    expect(s.calls.slice(1)).toEqual([
      "expire",
      "refund:in_sub_B",
      "cancel:sub_B",
    ]);

    // The duplicate's deletion event arrives: the mirror stays on sub_A.
    await reconcileStripeEvent(
      subEvent("customer.subscription.deleted", "sub_B"),
      deps,
    );
    expect(await mirror()).toMatchObject({
      subscriptionId: "sub_A",
      status: "active",
    });
    const resolved = await resolveEntitlement(account);
    expect(resolved.displayState).toBe("paid_monthly");
    expect(
      [...s.subs.values()].filter((x) => x.status !== "canceled"),
    ).toHaveLength(1);
  });

  it("a replay after the duplicate is gone changes nothing", async () => {
    const s = fakeStripe();
    s.add("sub_A");
    s.add("sub_B");
    const deps = { getSubscription: s.getSubscription };
    const a = checkoutDone("sub_A");
    await reconcileStripeEvent(a, deps);
    const b = checkoutDone("sub_B");
    await reconcileStripeEvent(b, deps);
    await enforceSingleSubscription(b, s.enforce);
    const before = [...s.calls];
    await reconcileStripeEvent(b, deps); // deduped
    await enforceSingleSubscription(b, s.enforce);
    expect(
      s.calls.filter((c) => c.startsWith("refund") || c.startsWith("cancel")),
    ).toEqual(
      before.filter((c) => c.startsWith("refund") || c.startsWith("cancel")),
    );
  });

  it("a failed refund cancels nothing, so the retry can finish", async () => {
    const s = fakeStripe();
    s.add("sub_A");
    s.add("sub_B");
    const deps = { getSubscription: s.getSubscription };
    await reconcileStripeEvent(checkoutDone("sub_A"), deps);
    const failing: EnforceDeps = {
      ...s.enforce,
      refundInvoice: async () => {
        throw new Error("stripe down");
      },
    };
    const b = checkoutDone("sub_B");
    await expect(enforceSingleSubscription(b, failing)).rejects.toThrow();
    expect(s.subs.get("sub_B")!.status).toBe("active"); // not canceled
    // Stripe redelivers; this time it succeeds.
    await enforceSingleSubscription(b, s.enforce);
    expect(s.subs.get("sub_B")!.status).toBe("canceled");
  });

  it("does nothing until the account has an established subscription", async () => {
    const s = fakeStripe();
    s.add("sub_A", { status: "incomplete" });
    const a = checkoutDone("sub_A");
    await reconcileStripeEvent(a, { getSubscription: s.getSubscription });
    await expect(
      enforceSingleSubscription(a, s.enforce),
    ).resolves.toMatchObject({
      status: "skipped",
    });
    expect(s.calls).toEqual([]);
  });

  it("ignores event types that can't create a duplicate", async () => {
    const s = fakeStripe();
    s.add("sub_A");
    await reconcileStripeEvent(checkoutDone("sub_A"), {
      getSubscription: s.getSubscription,
    });
    await expect(
      enforceSingleSubscription(
        subEvent("customer.subscription.deleted", "sub_A"),
        s.enforce,
      ),
    ).resolves.toMatchObject({ status: "skipped" });
  });

  it("never touches another account's subscriptions", async () => {
    // A second account with its own customer and subscription.
    const other = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    await getTestPrisma().billingAccount.create({
      data: {
        userId: other.userId,
        stripeCustomerId: "cus_other",
        subscriptionId: "sub_other",
        status: "active",
        interval: "month",
      },
    });
    const s = fakeStripe();
    s.add("sub_A");
    const a = checkoutDone("sub_A");
    await reconcileStripeEvent(a, { getSubscription: s.getSubscription });
    const listed: string[] = [];
    await enforceSingleSubscription(a, {
      ...s.enforce,
      listOpenSubscriptions: async (customerId) => {
        listed.push(customerId);
        return s.enforce.listOpenSubscriptions(customerId);
      },
    });
    expect(listed).toEqual([CUS]);
    expect(
      await getTestPrisma().billingAccount.findUniqueOrThrow({
        where: { userId: other.userId },
      }),
    ).toMatchObject({ subscriptionId: "sub_other", status: "active" });
  });
});
