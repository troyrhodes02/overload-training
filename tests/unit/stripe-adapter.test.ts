/**
 * Plans, Billing & Promo Codes — the Stripe adapter's subscription→mirror
 * mapping (`fetchSubscriptionSnapshot`). Verified against the live sandbox: in
 * API 2026-10-28 the Customer Portal schedules a cancellation by setting
 * `cancel_at` (a timestamp) and leaves `cancel_at_period_end` FALSE. Reading
 * only the boolean missed every portal cancellation (the reported bug). These
 * tests pin both representations plus renewal, reversal, a mid-cycle cancel,
 * and an already-ended subscription, with the Stripe SDK mocked (no network).
 */
const retrieve = jest.fn();
const listSubs = jest.fn();
const createSession = jest.fn();
const listSessions = jest.fn();
const expireSession = jest.fn();
const cancelSub = jest.fn();
const listInvoicePayments = jest.fn();
const createRefund = jest.fn();
jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    subscriptions: { retrieve, list: listSubs, cancel: cancelSub },
    invoicePayments: { list: listInvoicePayments },
    refunds: { create: createRefund },
    checkout: {
      sessions: {
        create: createSession,
        list: listSessions,
        expire: expireSession,
      },
    },
  })),
}));

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_PRICE_ID_MONTHLY = "price_monthly";
process.env.STRIPE_PRICE_ID_ANNUAL = "price_annual";

import {
  fetchSubscriptionSnapshot,
  stripeEnforceDeps,
  stripeProvider,
} from "@/lib/billing/stripe";

const UNIX = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const PERIOD_END = "2026-12-04T00:53:23.000Z";

type SubOver = Record<string, unknown>;
function fakeSub(over: SubOver = {}) {
  return {
    id: "sub_x",
    status: "active",
    customer: "cus_x",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    items: {
      data: [
        {
          price: { id: "price_x", recurring: { interval: "month" } },
          current_period_end: UNIX(PERIOD_END),
        },
      ],
    },
    ...over,
  };
}

beforeEach(() => retrieve.mockReset());

it("current API: a portal cancellation (cancel_at set, cancel_at_period_end false) is scheduled, ending on cancel_at", async () => {
  // The exact verified sandbox shape.
  retrieve.mockResolvedValue(
    fakeSub({
      cancel_at: UNIX(PERIOD_END),
      canceled_at: UNIX("2026-11-04T15:29:22Z"),
      cancellation_details: { reason: "cancellation_requested" },
    }),
  );
  const snap = await fetchSubscriptionSnapshot("sub_x");
  expect(snap?.cancelAtPeriodEnd).toBe(true);
  expect(snap?.currentPeriodEnd?.toISOString()).toBe(PERIOD_END);
  expect(snap?.status).toBe("active");
  expect(snap?.interval).toBe("month");
});

it("legacy: cancel_at_period_end=true (no cancel_at) is scheduled, ending on the period end", async () => {
  retrieve.mockResolvedValue(
    fakeSub({ cancel_at_period_end: true, cancel_at: null }),
  );
  const snap = await fetchSubscriptionSnapshot("sub_x");
  expect(snap?.cancelAtPeriodEnd).toBe(true);
  expect(snap?.currentPeriodEnd?.toISOString()).toBe(PERIOD_END);
});

it("a normal active subscription renews: not scheduled, period end is the renewal date", async () => {
  retrieve.mockResolvedValue(fakeSub());
  const snap = await fetchSubscriptionSnapshot("sub_x");
  expect(snap?.cancelAtPeriodEnd).toBe(false);
  expect(snap?.currentPeriodEnd?.toISOString()).toBe(PERIOD_END);
});

it("a reversed cancellation (cancel_at cleared) is no longer scheduled", async () => {
  // After "Don't cancel", Stripe clears both the flag and cancel_at.
  retrieve.mockResolvedValue(
    fakeSub({ cancel_at: null, cancel_at_period_end: false }),
  );
  const snap = await fetchSubscriptionSnapshot("sub_x");
  expect(snap?.cancelAtPeriodEnd).toBe(false);
  expect(snap?.currentPeriodEnd?.toISOString()).toBe(PERIOD_END);
});

it("a cancellation scheduled BEFORE the regular period end ends on cancel_at, not the period end", async () => {
  retrieve.mockResolvedValue(
    fakeSub({ cancel_at: UNIX("2026-11-20T00:00:00Z") }),
  );
  const snap = await fetchSubscriptionSnapshot("sub_x");
  expect(snap?.cancelAtPeriodEnd).toBe(true);
  expect(snap?.currentPeriodEnd?.toISOString()).toBe(
    "2026-11-20T00:00:00.000Z",
  );
});

it("an already-ended subscription maps status=canceled (resolver shows Free, not scheduled)", async () => {
  // The distinction between "scheduled to cancel" and "already ended" is carried
  // by status: the resolver turns canceled into Free regardless of the flag.
  retrieve.mockResolvedValue(
    fakeSub({
      status: "canceled",
      cancel_at: UNIX(PERIOD_END),
      canceled_at: UNIX("2026-11-04T15:29:22Z"),
    }),
  );
  const snap = await fetchSubscriptionSnapshot("sub_x");
  expect(snap?.status).toBe("canceled");
});

describe("checkout session: promotion codes on both intervals (OVE-112)", () => {
  beforeEach(() => {
    createSession.mockReset();
    createSession.mockResolvedValue({ url: "https://stripe.test/checkout" });
  });

  const base = {
    customerId: "cus_x",
    accountId: "acc_x",
    successUrl: "https://app/ok",
    cancelUrl: "https://app/no",
  };

  it("enables the promo-code field on MONTHLY checkout", async () => {
    await stripeProvider().createCheckoutSession({
      ...base,
      interval: "month",
    });
    const [params] = createSession.mock.calls[0];
    expect(params.allow_promotion_codes).toBe(true);
    expect(params.line_items[0].price).toBe("price_monthly");
  });

  it("enables the promo-code field on ANNUAL checkout too (the coupon is product-wide; Stripe decides)", async () => {
    await stripeProvider().createCheckoutSession({ ...base, interval: "year" });
    const [params] = createSession.mock.calls[0];
    expect(params.allow_promotion_codes).toBe(true);
    expect(params.line_items[0].price).toBe("price_annual");
  });

  it("never sets a Stripe trial, so an early subscription bills immediately", async () => {
    await stripeProvider().createCheckoutSession({
      ...base,
      interval: "month",
    });
    const [params] = createSession.mock.calls[0];
    expect(params.subscription_data).toEqual({
      metadata: { accountId: "acc_x" },
    });
    expect(params.subscription_data.trial_period_days).toBeUndefined();
    expect(params.subscription_data.trial_end).toBeUndefined();
    expect(params.mode).toBe("subscription");
  });
});

describe("duplicate-subscription guards (OVE-112)", () => {
  beforeEach(() => {
    listSubs.mockReset();
    listSessions.mockReset();
    expireSession.mockReset();
  });

  it.each([
    ["active", true],
    ["trialing", true],
    ["past_due", true],
    ["unpaid", true],
    ["incomplete", true],
    ["paused", true],
    ["canceled", false],
    ["incomplete_expired", false],
  ])("a %s subscription counts as open: %s", async (status, open) => {
    listSubs.mockResolvedValue({ data: [{ id: "sub_1", status }] });
    await expect(stripeProvider().hasOpenSubscription("cus_x")).resolves.toBe(
      open,
    );
    expect(listSubs).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_x", status: "all" }),
    );
  });

  it("expires every open checkout session for the customer", async () => {
    listSessions.mockResolvedValue({ data: [{ id: "cs_1" }, { id: "cs_2" }] });
    expireSession.mockResolvedValue({});
    await expect(
      stripeProvider().expireOpenCheckoutSessions("cus_x"),
    ).resolves.toBe(2);
    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_x", status: "open" }),
    );
    expect(expireSession.mock.calls.map((c) => c[0])).toEqual(["cs_1", "cs_2"]);
  });
});

describe("single-subscription enforcement deps (OVE-112)", () => {
  beforeEach(() => {
    listSubs.mockReset();
    cancelSub.mockReset();
    listInvoicePayments.mockReset();
    createRefund.mockReset();
  });

  it("lists only open subscriptions, with their latest invoice id", async () => {
    listSubs.mockResolvedValue({
      data: [
        { id: "sub_keep", status: "active", latest_invoice: "in_1" },
        { id: "sub_dup", status: "active", latest_invoice: { id: "in_2" } },
        { id: "sub_old", status: "canceled", latest_invoice: "in_0" },
        { id: "sub_new", status: "incomplete", latest_invoice: null },
      ],
    });
    await expect(
      stripeEnforceDeps().listOpenSubscriptions("cus_x"),
    ).resolves.toEqual([
      { id: "sub_keep", status: "active", latestInvoiceId: "in_1" },
      { id: "sub_dup", status: "active", latestInvoiceId: "in_2" },
      { id: "sub_new", status: "incomplete", latestInvoiceId: null },
    ]);
  });

  it("refunds each PAID invoice payment in full, as a duplicate, idempotently", async () => {
    listInvoicePayments.mockResolvedValue({
      data: [{ payment: { type: "payment_intent", payment_intent: "pi_1" } }],
    });
    createRefund.mockResolvedValue({ id: "re_1" });
    await expect(stripeEnforceDeps().refundInvoice("in_2")).resolves.toBe(1);
    expect(listInvoicePayments).toHaveBeenCalledWith(
      expect.objectContaining({ invoice: "in_2", status: "paid" }),
    );
    const [params, opts] = createRefund.mock.calls[0];
    expect(params).toMatchObject({
      payment_intent: "pi_1",
      reason: "duplicate",
    });
    expect(params.amount).toBeUndefined(); // full refund
    expect(opts).toEqual({ idempotencyKey: "overload-dup-refund-pi_1" });
  });

  it("falls back to the charge when a payment has no payment intent", async () => {
    listInvoicePayments.mockResolvedValue({
      data: [{ payment: { type: "charge", charge: "ch_1" } }],
    });
    createRefund.mockResolvedValue({ id: "re_1" });
    await stripeEnforceDeps().refundInvoice("in_2");
    expect(createRefund.mock.calls[0][0]).toMatchObject({ charge: "ch_1" });
  });

  it("treats an already-refunded payment as done", async () => {
    listInvoicePayments.mockResolvedValue({
      data: [{ payment: { type: "payment_intent", payment_intent: "pi_1" } }],
    });
    createRefund.mockRejectedValue(
      Object.assign(new Error("already"), { code: "charge_already_refunded" }),
    );
    await expect(stripeEnforceDeps().refundInvoice("in_2")).resolves.toBe(0);
  });

  it("rethrows any other refund failure (so the webhook retries)", async () => {
    listInvoicePayments.mockResolvedValue({
      data: [{ payment: { type: "payment_intent", payment_intent: "pi_1" } }],
    });
    createRefund.mockRejectedValue(new Error("network"));
    await expect(stripeEnforceDeps().refundInvoice("in_2")).rejects.toThrow(
      "network",
    );
  });

  it("cancels immediately with no proration and no final invoice", async () => {
    cancelSub.mockResolvedValue({});
    await stripeEnforceDeps().cancelSubscription("sub_dup");
    expect(cancelSub).toHaveBeenCalledWith("sub_dup", {
      prorate: false,
      invoice_now: false,
    });
  });
});
