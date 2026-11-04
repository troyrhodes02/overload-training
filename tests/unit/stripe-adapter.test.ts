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
jest.mock("stripe", () => ({
  __esModule: true,
  default: jest
    .fn()
    .mockImplementation(() => ({ subscriptions: { retrieve } })),
}));

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";

import { fetchSubscriptionSnapshot } from "@/lib/billing/stripe";

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
