import type { Account } from "@/lib/data/account";
import { deleteAccount } from "@/lib/accounts/deletion";
import {
  SubscriptionCancellationError,
  type DeletionBillingDeps,
} from "@/lib/billing/cancel-on-deletion";
import { reconcileStripeEvent } from "@/lib/data/billing-webhook";
import { createGym } from "@/lib/gyms/gyms";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import { ownedRowCount, snapshotAccount } from "./isolation/support";

/**
 * OVE-122 (mobile audit F-A2; Plans & Billing RD-16): deleting an account
 * cancels its Stripe subscriptions BEFORE any data is removed. A cancel
 * failure leaves the account and every row untouched; no subscription deletes
 * as before; a retry after a partial failure finishes; and webhooks that
 * arrive after deletion still resolve no account. Stripe is a stub here.
 */

let a: Account;
let b: Account;
const CUS = "cus_del_1";

const deleteAuthUser = async () => "deleted" as const;

async function subscribe(account: Account, customer: string, sub: string) {
  await createGym(account, { name: "Home" });
  await account.db.billingAccount.create({
    data: {
      userId: account.userId,
      stripeCustomerId: customer,
      subscriptionId: sub,
      status: "active",
      interval: "month",
    },
  });
}

beforeEach(async () => {
  a = await createTestAccount();
  b = await createTestAccount();
  await subscribe(a, CUS, "sub_del_1");
  await subscribe(b, "cus_del_2", "sub_del_2");
});

it("cancels on the account's own customer BEFORE any data is deleted", async () => {
  let rowsAtCancel = -1;
  const billing: DeletionBillingDeps = {
    cancelAllSubscriptions: jest.fn(async () => {
      rowsAtCancel = await ownedRowCount(a.userId);
      return { canceled: ["sub_del_1"] };
    }),
  };
  const rowsBefore = await ownedRowCount(a.userId);
  await deleteAccount(a, { deleteAuthUser, billing });
  expect(billing.cancelAllSubscriptions).toHaveBeenCalledTimes(1);
  expect(billing.cancelAllSubscriptions).toHaveBeenCalledWith(CUS);
  expect(rowsAtCancel).toBe(rowsBefore); // nothing deleted yet when it ran
  expect(await ownedRowCount(a.userId)).toBe(0);
});

it("a cancel failure leaves the account and all its data untouched", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const aBefore = await snapshotAccount(a.userId);
  const bBefore = await snapshotAccount(b.userId);
  const removeIdentity = jest.fn(deleteAuthUser);
  await expect(
    deleteAccount(a, {
      deleteAuthUser: removeIdentity,
      billing: {
        cancelAllSubscriptions: async () => {
          throw new Error("stripe down");
        },
      },
    }),
  ).rejects.toBeInstanceOf(SubscriptionCancellationError);
  expect(await snapshotAccount(a.userId)).toEqual(aBefore);
  expect(await snapshotAccount(b.userId)).toEqual(bBefore);
  expect(removeIdentity).not.toHaveBeenCalled();
  log.mockRestore();
});

it("refuses when Stripe isn't configured but the mirror records a subscription", async () => {
  const aBefore = await snapshotAccount(a.userId);
  await expect(
    deleteAccount(a, {
      deleteAuthUser,
      billing: { cancelAllSubscriptions: null },
    }),
  ).rejects.toBeInstanceOf(SubscriptionCancellationError);
  expect(await snapshotAccount(a.userId)).toEqual(aBefore);
});

it("an account with no Stripe customer deletes normally and never calls Stripe", async () => {
  const free = await createTestAccount();
  await createGym(free, { name: "Garage" });
  const cancelAll = jest.fn();
  const result = await deleteAccount(free, {
    deleteAuthUser,
    billing: { cancelAllSubscriptions: cancelAll },
  });
  expect(cancelAll).not.toHaveBeenCalled();
  expect(result.identityRemoved).toBe(true);
  expect(await ownedRowCount(free.userId)).toBe(0);
});

it("a customer with nothing left to cancel deletes normally, even without Stripe configured", async () => {
  const lapsed = await createTestAccount();
  await lapsed.db.billingAccount.create({
    data: {
      userId: lapsed.userId,
      stripeCustomerId: "cus_lapsed",
      subscriptionId: "sub_lapsed",
      status: "canceled",
    },
  });
  await deleteAccount(lapsed, {
    deleteAuthUser,
    billing: { cancelAllSubscriptions: null },
  });
  expect(await ownedRowCount(lapsed.userId)).toBe(0);
});

it("a retry after a partial cancel failure succeeds", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  // Stripe-side state: two open subscriptions; the first attempt cancels one
  // and then fails on the second.
  const open = new Set(["sub_x", "sub_y"]);
  let attempt = 0;
  const billing: DeletionBillingDeps = {
    async cancelAllSubscriptions() {
      attempt += 1;
      const canceled: string[] = [];
      for (const id of [...open]) {
        if (attempt === 1 && id === "sub_y") throw new Error("timeout");
        open.delete(id); // already-canceled ones are skipped on the retry
        canceled.push(id);
      }
      return { canceled };
    },
  };
  const before = await snapshotAccount(a.userId);
  await expect(
    deleteAccount(a, { deleteAuthUser, billing }),
  ).rejects.toBeInstanceOf(SubscriptionCancellationError);
  expect(await snapshotAccount(a.userId)).toEqual(before);

  const retry = await deleteAccount(a, { deleteAuthUser, billing });
  expect(retry.identityRemoved).toBe(true);
  expect(open.size).toBe(0);
  expect(await ownedRowCount(a.userId)).toBe(0);
  log.mockRestore();
});

it("webhooks that arrive after deletion are still ignored", async () => {
  await deleteAccount(a, {
    deleteAuthUser,
    billing: { cancelAllSubscriptions: async () => ({ canceled: [] }) },
  });
  const snap = {
    subscriptionId: "sub_del_1",
    customerId: CUS,
    status: "canceled" as const,
    interval: "month" as const,
    currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
    cancelAtPeriodEnd: false,
    priceId: "price_monthly",
    promo: null,
  };
  const deps = { getSubscription: async () => snap };

  const deletedEvent = await reconcileStripeEvent(
    {
      id: "evt_after_delete_1",
      type: "customer.subscription.deleted",
      object: { id: "sub_del_1", customer: CUS },
    },
    deps,
  );
  expect(deletedEvent.status).toBe("ignored");

  // Even a payload naming the deleted account can't re-link it.
  const relink = await reconcileStripeEvent(
    {
      id: "evt_after_delete_2",
      type: "checkout.session.completed",
      object: {
        customer: CUS,
        subscription: "sub_del_1",
        client_reference_id: a.userId,
      },
    },
    deps,
  );
  expect(relink).toEqual({ status: "ignored", reason: "unknown_account" });
  expect(
    await getTestPrisma().billingAccount.findUnique({
      where: { stripeCustomerId: CUS },
    }),
  ).toBeNull();
  // The other account's mirror is untouched.
  expect(
    await getTestPrisma().billingAccount.findUnique({
      where: { userId: b.userId },
    }),
  ).not.toBeNull();
});
