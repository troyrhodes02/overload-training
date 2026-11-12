/**
 * OVE-122 (mobile audit F-A2; Plans & Billing RD-16): deleting an account
 * cancels its Stripe subscriptions first, and a failure stops the deletion
 * before anything is removed. Stripe is stubbed; no network.
 */
const listSubs = jest.fn();
const cancelSub = jest.fn();
const retrieveSub = jest.fn();
jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    subscriptions: { list: listSubs, cancel: cancelSub, retrieve: retrieveSub },
  })),
}));
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";

import type { Account } from "@/lib/data/account";
import {
  cancelSubscriptionsBeforeDeletion,
  SubscriptionCancellationError,
} from "@/lib/billing/cancel-on-deletion";
import { stripeDeletionDeps } from "@/lib/billing/stripe";

type Mirror = {
  stripeCustomerId: string;
  subscriptionId: string | null;
  status: string | null;
} | null;

function account(mirror: Mirror): Account {
  return {
    userId: "a0000000-0000-4000-8000-000000000001",
    timeZone: "UTC",
    db: { billingAccount: { findUnique: jest.fn(async () => mirror) } },
  } as unknown as Account;
}

beforeEach(() => {
  listSubs.mockReset();
  cancelSub.mockReset();
  retrieveSub.mockReset();
});

describe("cancelSubscriptionsBeforeDeletion", () => {
  it("no Stripe customer: nothing to cancel, Stripe never called", async () => {
    const cancelAll = jest.fn();
    await expect(
      cancelSubscriptionsBeforeDeletion(account(null), {
        cancelAllSubscriptions: cancelAll,
      }),
    ).resolves.toEqual({ canceled: [] });
    expect(cancelAll).not.toHaveBeenCalled();
  });

  it("a customer: cancels on that customer (read from Stripe, not the mirror)", async () => {
    const cancelAll = jest.fn(async () => ({ canceled: ["sub_1"] }));
    await cancelSubscriptionsBeforeDeletion(
      account({
        stripeCustomerId: "cus_1",
        subscriptionId: null,
        status: null,
      }),
      { cancelAllSubscriptions: cancelAll },
    );
    expect(cancelAll).toHaveBeenCalledWith("cus_1");
  });

  it("a Stripe failure becomes SubscriptionCancellationError", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      cancelSubscriptionsBeforeDeletion(
        account({
          stripeCustomerId: "cus_1",
          subscriptionId: "sub_1",
          status: "active",
        }),
        {
          cancelAllSubscriptions: async () => {
            throw new Error("stripe down");
          },
        },
      ),
    ).rejects.toBeInstanceOf(SubscriptionCancellationError);
    spy.mockRestore();
  });

  it.each([
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "incomplete",
    "paused",
    null,
  ])(
    "Stripe not configured + mirror subscription (%s): refuses",
    async (status) => {
      await expect(
        cancelSubscriptionsBeforeDeletion(
          account({
            stripeCustomerId: "cus_1",
            subscriptionId: "sub_1",
            status,
          }),
          { cancelAllSubscriptions: null },
        ),
      ).rejects.toBeInstanceOf(SubscriptionCancellationError);
    },
  );

  it.each([
    [null, null],
    ["sub_1", "canceled"],
    ["sub_1", "incomplete_expired"],
  ])(
    "Stripe not configured + no live subscription (%s, %s): proceeds",
    async (subscriptionId, status) => {
      await expect(
        cancelSubscriptionsBeforeDeletion(
          account({ stripeCustomerId: "cus_1", subscriptionId, status }),
          { cancelAllSubscriptions: null },
        ),
      ).resolves.toEqual({ canceled: [] });
    },
  );
});

describe("stripeDeletionDeps — the Stripe side", () => {
  const sub = (id: string, status: string) => ({ id, status });

  it("is not configured without a secret key", () => {
    expect(stripeDeletionDeps({}).cancelAllSubscriptions).toBeNull();
  });

  it("cancels every not-yet-over subscription immediately, with no proration or final invoice", async () => {
    listSubs.mockResolvedValue({
      data: [
        sub("sub_a", "active"),
        sub("sub_b", "past_due"),
        sub("sub_c", "canceled"),
        sub("sub_d", "incomplete_expired"),
      ],
      has_more: false,
    });
    cancelSub.mockResolvedValue({});
    const result = await stripeDeletionDeps().cancelAllSubscriptions!("cus_1");
    expect(listSubs).toHaveBeenCalledWith({
      customer: "cus_1",
      status: "all",
      limit: 100,
    });
    expect(result).toEqual({ canceled: ["sub_a", "sub_b"] });
    expect(cancelSub).toHaveBeenCalledTimes(2);
    for (const call of cancelSub.mock.calls) {
      expect(call[1]).toEqual({ prorate: false, invoice_now: false });
    }
  });

  it("pages through every subscription", async () => {
    listSubs
      .mockResolvedValueOnce({ data: [sub("sub_a", "active")], has_more: true })
      .mockResolvedValueOnce({
        data: [sub("sub_b", "trialing")],
        has_more: false,
      });
    cancelSub.mockResolvedValue({});
    const result = await stripeDeletionDeps().cancelAllSubscriptions!("cus_1");
    expect(listSubs).toHaveBeenLastCalledWith({
      customer: "cus_1",
      status: "all",
      limit: 100,
      starting_after: "sub_a",
    });
    expect(result.canceled).toEqual(["sub_a", "sub_b"]);
  });

  it("retry-safe: a cancel that fails because the subscription already ended counts as done", async () => {
    listSubs.mockResolvedValue({
      data: [sub("sub_a", "active")],
      has_more: false,
    });
    cancelSub.mockRejectedValue(new Error("already canceled"));
    retrieveSub.mockResolvedValue(sub("sub_a", "canceled"));
    await expect(
      stripeDeletionDeps().cancelAllSubscriptions!("cus_1"),
    ).resolves.toEqual({ canceled: [] });
  });

  it("a cancel that fails while the subscription is still live is a failure", async () => {
    listSubs.mockResolvedValue({
      data: [sub("sub_a", "active")],
      has_more: false,
    });
    cancelSub.mockRejectedValue(new Error("stripe down"));
    retrieveSub.mockResolvedValue(sub("sub_a", "active"));
    await expect(
      stripeDeletionDeps().cancelAllSubscriptions!("cus_1"),
    ).rejects.toThrow("stripe down");
  });

  it("a customer Stripe no longer has holds nothing to cancel", async () => {
    listSubs.mockRejectedValue(
      Object.assign(new Error("No such customer"), {
        code: "resource_missing",
        param: "customer",
      }),
    );
    await expect(
      stripeDeletionDeps().cancelAllSubscriptions!("cus_gone"),
    ).resolves.toEqual({ canceled: [] });
  });

  it("any other list failure propagates", async () => {
    listSubs.mockRejectedValue(new Error("network"));
    await expect(
      stripeDeletionDeps().cancelAllSubscriptions!("cus_1"),
    ).rejects.toThrow("network");
    expect(cancelSub).not.toHaveBeenCalled();
  });
});
