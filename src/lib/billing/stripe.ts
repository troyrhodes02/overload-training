import "server-only";
import Stripe from "stripe";
import type { MirrorSnapshot } from "@/lib/data/billing-webhook";

/**
 * Plans, Billing & Promo Codes — the Stripe adapter (spec §11, RD-8/RD-12).
 *
 * The ONE place the Stripe SDK is constructed, behind a small `BillingProvider`
 * interface so the checkout/portal/webhook logic takes it as an injectable
 * dependency (mirroring the recovery/signup deps pattern) and unit tests pass a
 * fake. The secret key never leaves the server; card data never touches
 * Overload (hosted Checkout + Customer Portal only). Runs use TEST MODE keys —
 * switching to live is a human step (runbook).
 */

export type BillingInterval = "month" | "year";

export type CheckoutParams = {
  customerId: string;
  interval: BillingInterval;
  /** The acting account id, carried as client_reference_id + subscription metadata. */
  accountId: string;
  successUrl: string;
  cancelUrl: string;
};

export type BillingProvider = {
  /** Find or create the Stripe customer for an account (by stored id or email). */
  ensureCustomer(input: {
    existingCustomerId: string | null;
    email: string;
    accountId: string;
  }): Promise<string>;
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }>;
  createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
};

let client: Stripe | null = null;

/** The one Stripe client, built lazily from the server-only secret key. */
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
    client = new Stripe(key, { apiVersion: "2026-10-28.endive" });
  }
  return client;
}

/** Price id for an interval, from env (test-mode ids; owner sets real ones). */
export function priceId(interval: BillingInterval): string {
  const name =
    interval === "year" ? "STRIPE_PRICE_ID_ANNUAL" : "STRIPE_PRICE_ID_MONTHLY";
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/** Whether to let Stripe compute tax (default off; owner-gated — RD-12). */
export function taxEnabled(): boolean {
  return process.env.STRIPE_TAX_ENABLED === "true";
}

/** The real provider over the Stripe SDK. */
export function stripeProvider(): BillingProvider {
  return {
    async ensureCustomer({ existingCustomerId, email, accountId }) {
      if (existingCustomerId) return existingCustomerId;
      const customer = await stripe().customers.create({
        email,
        metadata: { accountId },
      });
      return customer.id;
    },
    async createCheckoutSession({
      customerId,
      interval,
      accountId,
      successUrl,
      cancelUrl,
    }) {
      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId(interval), quantity: 1 }],
        // Promotions are monthly-only (RD-7: BLIZZY = 50% off 3 monthly periods).
        // The promo-code field only appears on MONTHLY checkout, so a code can
        // never be applied to an annual subscription here — server-side
        // enforcement that does not depend on the Stripe coupon being correctly
        // price-scoped. (Still restrict the coupon to the monthly price in
        // Stripe as defence in depth; see the runbook.)
        allow_promotion_codes: interval === "month",
        client_reference_id: accountId,
        subscription_data: { metadata: { accountId } },
        automatic_tax: { enabled: taxEnabled() },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (!session.url) throw new Error("Stripe returned no checkout URL.");
      return { url: session.url };
    },
    async createPortalSession({ customerId, returnUrl }) {
      const session = await stripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { url: session.url };
    },
  };
}

/** Absolute app URL for Stripe return targets (NEXT_PUBLIC_APP_URL or localhost). */
export function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

/** Verify a webhook payload's signature and return the parsed event (RD-6). */
export function constructWebhookEvent(
  rawBody: string,
  signature: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Re-fetch a subscription from Stripe and map it to the mirror snapshot the
 * webhook reconciler applies (RD-6). Returns null when it cannot be read.
 */
export async function fetchSubscriptionSnapshot(
  subscriptionId: string,
): Promise<MirrorSnapshot | null> {
  const sub = (await stripe().subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price", "discounts.promotion_code"],
  })) as Stripe.Subscription & {
    current_period_end?: number;
    discount?: unknown;
    discounts?: unknown;
  };
  if (!sub) return null;
  const item = sub.items?.data?.[0] as
    (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  const price = item?.price;
  const interval: BillingInterval | null =
    price?.recurring?.interval === "year"
      ? "year"
      : price?.recurring?.interval === "month"
        ? "month"
        : null;
  // In Stripe API 2026-10-28 / SDK 23.x the period end moved from the top-level
  // subscription onto each subscription item; read the item first, falling back
  // to the legacy top-level field for older API shapes.
  const periodEndUnix =
    typeof item?.current_period_end === "number"
      ? item.current_period_end
      : typeof sub.current_period_end === "number"
        ? sub.current_period_end
        : null;

  // A scheduled cancellation has two representations. Legacy: the boolean
  // `cancel_at_period_end`. Current (API 2026-10-28, verified against the live
  // sandbox): the Customer Portal records "cancel at end of period" by setting
  // `cancel_at` to a timestamp and leaves `cancel_at_period_end` FALSE — so
  // reading only the boolean misses every portal cancellation. Treat EITHER as
  // scheduled-to-cancel. (An already-ended subscription is distinguished by its
  // `status` becoming `canceled`, which the resolver maps to Free, not here.)
  const cancelAtUnix = typeof sub.cancel_at === "number" ? sub.cancel_at : null;
  const scheduledToCancel =
    Boolean(sub.cancel_at_period_end) || cancelAtUnix !== null;

  // The effective end date the lifter sees ("ends on" / "renews on"). When a
  // cancellation is scheduled to a specific instant — which can fall before the
  // regular period end for a mid-cycle cancel — `cancel_at` is that date;
  // otherwise it is the period end. `cancel_at` takes precedence when present.
  const effectiveEndUnix = cancelAtUnix ?? periodEndUnix;

  return {
    subscriptionId: sub.id,
    customerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    status: sub.status as MirrorSnapshot["status"],
    interval,
    currentPeriodEnd:
      effectiveEndUnix !== null ? new Date(effectiveEndUnix * 1000) : null,
    cancelAtPeriodEnd: scheduledToCancel,
    priceId: price?.id ?? null,
    promo: readPromo(sub),
  };
}

function readPromo(sub: {
  discount?: unknown;
  discounts?: unknown;
}): MirrorSnapshot["promo"] {
  // Stripe exposes either a single `discount` or a `discounts` array depending
  // on account settings; read whichever is present. The human-readable code
  // comes from the expanded promotion_code; fall back to the coupon id.
  const discount = Array.isArray(sub.discounts)
    ? (sub.discounts[0] as Record<string, unknown> | undefined)
    : ((sub.discount as Record<string, unknown> | null) ?? undefined);
  if (!discount) return null;
  const coupon = discount.coupon as { id?: string } | undefined;
  const promotionCode = discount.promotion_code as
    { id?: string; code?: string } | string | undefined;
  const couponId = coupon?.id ?? "unknown";
  const promotionCodeId =
    typeof promotionCode === "string"
      ? promotionCode
      : (promotionCode?.id ?? null);
  const code =
    typeof promotionCode === "object" && promotionCode?.code
      ? promotionCode.code
      : couponId;
  return { code, couponId, promotionCodeId };
}
