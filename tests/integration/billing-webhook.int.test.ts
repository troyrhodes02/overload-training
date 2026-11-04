import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import {
  reconcileStripeEvent,
  syncBillingFromStripe,
  type MirrorSnapshot,
  type StripeEventInput,
} from "@/lib/data/billing-webhook";
import type { Account } from "@/lib/data/account";

/**
 * Plans, Billing & Promo Codes — the Stripe webhook reconciler (AC-4/5/6,
 * spec §14). Authenticated signature verification lives at the route; here we
 * prove the data-layer invariants with a fake `getSubscription` (no live
 * Stripe): idempotent dedupe, reconcile-to-truth, the grace window, promo
 * mirrored once, account resolved from the customer id (never the payload),
 * and that nothing touches training data.
 */

const CUS = "cus_test_1";
const SUB = "sub_test_1";
let account: Account;

beforeEach(async () => {
  account = await createTestAccount("UTC", undefined, { entitlement: "none" });
});

function snap(over: Partial<MirrorSnapshot> = {}): MirrorSnapshot {
  return {
    subscriptionId: SUB,
    customerId: CUS,
    status: "active",
    interval: "month",
    currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
    cancelAtPeriodEnd: false,
    priceId: "price_monthly",
    promo: null,
    ...over,
  };
}

function checkoutCompleted(): StripeEventInput {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: "checkout.session.completed",
    object: {
      customer: CUS,
      subscription: SUB,
      client_reference_id: account.userId,
    },
  };
}
function subUpdated(
  id = `evt_${Math.random().toString(36).slice(2)}`,
): StripeEventInput {
  return {
    id,
    type: "customer.subscription.updated",
    object: { id: SUB, customer: CUS },
  };
}

const depsReturning = (s: MirrorSnapshot | null, now?: Date) => ({
  getSubscription: async () => s,
  now: now ? () => now : undefined,
});

const mirror = () =>
  getTestPrisma().billingAccount.findUnique({
    where: { userId: account.userId },
  });

describe("account linking + reconcile", () => {
  it("links the customer from client_reference_id and mirrors the subscription", async () => {
    const out = await reconcileStripeEvent(
      checkoutCompleted(),
      depsReturning(snap()),
    );
    expect(out).toEqual({ status: "processed", userId: account.userId });
    const m = await mirror();
    expect(m?.stripeCustomerId).toBe(CUS);
    expect(m?.status).toBe("active");
    expect(m?.interval).toBe("month");
    expect(m?.cancelAtPeriodEnd).toBe(false);
  });

  it("resolves a later event from the stored customer id alone (no client_reference_id)", async () => {
    await reconcileStripeEvent(checkoutCompleted(), depsReturning(snap()));
    const out = await reconcileStripeEvent(
      subUpdated(),
      depsReturning(snap({ cancelAtPeriodEnd: true })),
    );
    expect(out).toEqual({ status: "processed", userId: account.userId });
    expect((await mirror())?.cancelAtPeriodEnd).toBe(true);
  });

  it("persists a scheduled cancellation (flag + period end) then clears it on reversal, out of order", async () => {
    await reconcileStripeEvent(checkoutCompleted(), depsReturning(snap()));

    // Schedule the cancellation: Stripe truth now carries the end date.
    const endsAt = new Date("2026-12-04T00:00:00Z");
    await reconcileStripeEvent(
      subUpdated("evt_cancel"),
      depsReturning(
        snap({ cancelAtPeriodEnd: true, currentPeriodEnd: endsAt }),
      ),
    );
    const canceled = await mirror();
    expect(canceled?.cancelAtPeriodEnd).toBe(true);
    expect(canceled?.currentPeriodEnd?.toISOString()).toBe(
      endsAt.toISOString(),
    );
    expect(canceled?.status).toBe("active"); // still active, just ending

    // Reverse it. Reconcile-to-truth: the flag goes back to false. A webhook
    // that lands out of order still lands on current Stripe truth, not a diff.
    await reconcileStripeEvent(
      subUpdated("evt_reverse"),
      depsReturning(
        snap({ cancelAtPeriodEnd: false, currentPeriodEnd: endsAt }),
      ),
    );
    expect((await mirror())?.cancelAtPeriodEnd).toBe(false);
  });

  it("ignores an event whose client_reference_id names no account", async () => {
    const ev = checkoutCompleted();
    ev.object.client_reference_id = "00000000-0000-4000-8000-000000000000";
    const out = await reconcileStripeEvent(ev, depsReturning(snap()));
    expect(out).toEqual({ status: "ignored", reason: "unknown_account" });
    expect(await mirror()).toBeNull();
  });
});

describe("read-time sync self-heals a stale mirror (missed webhook)", () => {
  it("picks up a scheduled cancellation that no webhook ever delivered", async () => {
    // The mirror is linked and active, exactly as after checkout. No
    // customer.subscription.updated arrived (the reported Preview bug).
    await reconcileStripeEvent(checkoutCompleted(), depsReturning(snap()));
    expect((await mirror())?.cancelAtPeriodEnd).toBe(false);

    // Loading Plan & Billing refetches Stripe's truth and reconciles.
    const endsAt = new Date("2026-12-04T00:00:00Z");
    const out = await syncBillingFromStripe(
      { userId: account.userId, subscriptionId: SUB },
      depsReturning(
        snap({ cancelAtPeriodEnd: true, currentPeriodEnd: endsAt }),
      ),
    );
    expect(out).toEqual({ status: "synced" });
    const m = await mirror();
    expect(m?.cancelAtPeriodEnd).toBe(true);
    expect(m?.currentPeriodEnd?.toISOString()).toBe(endsAt.toISOString());
  });

  it("restores the active state when the cancellation is reversed", async () => {
    await reconcileStripeEvent(
      checkoutCompleted(),
      depsReturning(snap({ cancelAtPeriodEnd: true })),
    );
    expect((await mirror())?.cancelAtPeriodEnd).toBe(true);

    await syncBillingFromStripe(
      { userId: account.userId, subscriptionId: SUB },
      depsReturning(snap({ cancelAtPeriodEnd: false })),
    );
    expect((await mirror())?.cancelAtPeriodEnd).toBe(false);
  });

  it("leaves the mirror untouched when Stripe is unavailable", async () => {
    await reconcileStripeEvent(checkoutCompleted(), depsReturning(snap()));
    const before = await mirror();
    const out = await syncBillingFromStripe(
      { userId: account.userId, subscriptionId: SUB },
      depsReturning(null),
    );
    expect(out).toEqual({ status: "unavailable" });
    expect((await mirror())?.updatedAt).toEqual(before?.updatedAt);
  });
});

describe("idempotency (AC-4)", () => {
  it("a replayed event id is a no-op and never duplicates a redemption", async () => {
    const ev = checkoutCompleted();
    const promoSnap = snap({
      promo: {
        code: "BLIZZY",
        couponId: "co_blizzy",
        promotionCodeId: "promo_1",
      },
    });
    const first = await reconcileStripeEvent(ev, depsReturning(promoSnap));
    expect(first.status).toBe("processed");
    const again = await reconcileStripeEvent(ev, depsReturning(promoSnap));
    expect(again).toEqual({ status: "duplicate" });
    const redemptions = await getTestPrisma().promoRedemption.findMany({
      where: { userId: account.userId },
    });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].code).toBe("BLIZZY");
  });

  it("the same promo across two distinct events still mirrors once", async () => {
    const promo = {
      code: "BLIZZY",
      couponId: "co_blizzy",
      promotionCodeId: "promo_1",
    };
    await reconcileStripeEvent(
      checkoutCompleted(),
      depsReturning(snap({ promo })),
    );
    await reconcileStripeEvent(subUpdated(), depsReturning(snap({ promo })));
    expect(
      await getTestPrisma().promoRedemption.count({
        where: { userId: account.userId },
      }),
    ).toBe(1);
  });
});

describe("invoice events drive grace (review finding 3)", () => {
  // Invoice objects carry the subscription id at
  // parent.subscription_details.subscription in Stripe API 2026-10-28.
  function invoicePaymentFailed(): StripeEventInput {
    return {
      id: `evt_${Math.random().toString(36).slice(2)}`,
      type: "invoice.payment_failed",
      object: {
        customer: CUS,
        parent: { subscription_details: { subscription: SUB } },
      },
    };
  }

  it("invoice.payment_failed resolves the subscription and opens the grace window", async () => {
    const t0 = new Date("2026-11-20T00:00:00Z");
    await reconcileStripeEvent(checkoutCompleted(), depsReturning(snap()));
    const out = await reconcileStripeEvent(
      invoicePaymentFailed(),
      depsReturning(snap({ status: "past_due" }), t0),
    );
    expect(out).toEqual({ status: "processed", userId: account.userId });
    const m = await mirror();
    expect(m?.status).toBe("past_due");
    expect(m?.graceEndsAt?.toISOString()).toBe("2026-11-27T00:00:00.000Z");
  });
});

describe("failed-payment grace (AC-6) and lifecycle", () => {
  it("past_due sets a grace window; recovery clears it; cancel ends it", async () => {
    const t0 = new Date("2026-11-20T00:00:00Z");
    await reconcileStripeEvent(checkoutCompleted(), depsReturning(snap()));

    await reconcileStripeEvent(
      subUpdated(),
      depsReturning(snap({ status: "past_due" }), t0),
    );
    const pastDue = await mirror();
    expect(pastDue?.status).toBe("past_due");
    // 7-day grace from first observation.
    expect(pastDue?.graceEndsAt?.toISOString()).toBe(
      "2026-11-27T00:00:00.000Z",
    );

    await reconcileStripeEvent(
      subUpdated(),
      depsReturning(snap({ status: "active" })),
    );
    const recovered = await mirror();
    expect(recovered?.status).toBe("active");
    expect(recovered?.graceEndsAt).toBeNull();

    await reconcileStripeEvent(
      subUpdated(),
      depsReturning(snap({ status: "canceled" })),
    );
    expect((await mirror())?.status).toBe("canceled");
  });

  it("a second past_due event does not extend the original grace window", async () => {
    const t0 = new Date("2026-11-20T00:00:00Z");
    const t1 = new Date("2026-11-23T00:00:00Z");
    await reconcileStripeEvent(checkoutCompleted(), depsReturning(snap()));
    await reconcileStripeEvent(
      subUpdated(),
      depsReturning(snap({ status: "past_due" }), t0),
    );
    await reconcileStripeEvent(
      subUpdated(),
      depsReturning(snap({ status: "past_due" }), t1),
    );
    expect((await mirror())?.graceEndsAt?.toISOString()).toBe(
      "2026-11-27T00:00:00.000Z",
    );
  });
});

describe("safety", () => {
  it("records the event id for a handled event (the dedupe ledger)", async () => {
    const ev = checkoutCompleted();
    await reconcileStripeEvent(ev, depsReturning(snap()));
    const row = await getTestPrisma().webhookEvent.findUnique({
      where: { id: ev.id },
    });
    expect(row?.type).toBe("checkout.session.completed");
  });

  it("an unhandled event type is recorded but changes no billing state", async () => {
    const ev: StripeEventInput = {
      id: "evt_unhandled",
      type: "customer.updated",
      object: { customer: CUS },
    };
    const out = await reconcileStripeEvent(ev, depsReturning(snap()));
    expect(out).toEqual({ status: "ignored", reason: "unhandled_type" });
    expect(await mirror()).toBeNull();
  });
});
