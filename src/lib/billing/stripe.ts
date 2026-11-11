import "server-only";
import Stripe from "stripe";
import type {
  EnforceDeps,
  MirrorSnapshot,
  OpenSubscription,
} from "@/lib/data/billing-webhook";

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
  createCheckoutSession(
    params: CheckoutParams,
  ): Promise<{ url: string; sessionId: string }>;
  /**
   * A hosted Checkout session's outcome and owning customer (OVE-112), for
   * the browser-back case: did the lifter pay, or leave? Null when Stripe
   * has no such session.
   */
  getCheckoutSession(sessionId: string): Promise<{
    status: "open" | "complete" | "expired";
    customerId: string | null;
  } | null>;
  createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  /**
   * Whether the customer already has a subscription in Stripe that is not over
   * (active, trialing, past_due, unpaid, incomplete, paused). Read from Stripe,
   * not the mirror, so a just-paid subscription whose webhook has not landed
   * yet still blocks a second checkout (OVE-112).
   */
  hasOpenSubscription(customerId: string): Promise<boolean>;
  /**
   * Expire every still-open hosted Checkout session for the customer, so at
   * most one can ever be completed (a refresh or a second click starts a new
   * one and retires the old). Returns how many were expired.
   */
  expireOpenCheckoutSessions(customerId: string): Promise<number>;
};

/** Stripe statuses that mean a subscription is not over (OVE-112). */
const OPEN_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

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
        // The promotion-code field is offered on both intervals (OVE-112). The
        // live coupon applies to the Pro product (monthly and annual prices)
        // for three months; Stripe alone decides whether a code applies, and
        // on annual it discounts only the first annual payment.
        allow_promotion_codes: true,
        client_reference_id: accountId,
        subscription_data: { metadata: { accountId } },
        automatic_tax: { enabled: taxEnabled() },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (!session.url) throw new Error("Stripe returned no checkout URL.");
      return { url: session.url, sessionId: session.id };
    },
    async getCheckoutSession(sessionId) {
      try {
        const session = await stripe().checkout.sessions.retrieve(sessionId);
        const customer = session.customer;
        return {
          status: (session.status ?? "open") as "open" | "complete" | "expired",
          customerId:
            typeof customer === "string" ? customer : (customer?.id ?? null),
        };
      } catch (error) {
        if ((error as { code?: string }).code === "resource_missing") {
          return null;
        }
        throw error;
      }
    },
    async createPortalSession({ customerId, returnUrl }) {
      const session = await stripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { url: session.url };
    },
    async hasOpenSubscription(customerId) {
      const subs = await stripe().subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 20,
      });
      return subs.data.some((s) => OPEN_SUBSCRIPTION_STATUSES.has(s.status));
    },
    async expireOpenCheckoutSessions(customerId) {
      const open = await stripe().checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 20,
      });
      for (const session of open.data) {
        await stripe().checkout.sessions.expire(session.id);
      }
      return open.data.length;
    },
  };
}

/**
 * The Stripe side of the single-subscription guard (OVE-112): list the
 * customer's open subscriptions, refund a duplicate's paid invoice, cancel it,
 * and expire leftover Checkout sessions. Only ever called by the webhook route
 * through enforceSingleSubscription.
 */
export function stripeEnforceDeps(): EnforceDeps {
  return {
    async listOpenSubscriptions(customerId) {
      const subs = await stripe().subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 20,
      });
      return subs.data
        .filter((s) => OPEN_SUBSCRIPTION_STATUSES.has(s.status))
        .map((s): OpenSubscription => ({
          id: s.id,
          status: s.status as OpenSubscription["status"],
          latestInvoiceId:
            typeof s.latest_invoice === "string"
              ? s.latest_invoice
              : (s.latest_invoice?.id ?? null),
        }));
    },
    async refundInvoice(invoiceId) {
      // API 2026-10-28: an invoice's payments are InvoicePayment objects.
      const payments = await stripe().invoicePayments.list({
        invoice: invoiceId,
        status: "paid",
        limit: 10,
      });
      let refunded = 0;
      for (const p of payments.data) {
        const pi =
          typeof p.payment.payment_intent === "string"
            ? p.payment.payment_intent
            : p.payment.payment_intent?.id;
        const charge =
          typeof p.payment.charge === "string"
            ? p.payment.charge
            : p.payment.charge?.id;
        const target = pi ? { payment_intent: pi } : charge ? { charge } : null;
        if (!target) continue;
        try {
          await stripe().refunds.create(
            {
              ...target,
              reason: "duplicate",
              metadata: { overload: "duplicate_subscription" },
            },
            { idempotencyKey: `overload-dup-refund-${pi ?? charge}` },
          );
          refunded += 1;
        } catch (error) {
          // Already refunded (an earlier delivery got this far): done.
          const code = (error as { code?: string }).code;
          if (code === "charge_already_refunded") continue;
          throw error;
        }
      }
      return refunded;
    },
    async cancelSubscription(subscriptionId) {
      await stripe().subscriptions.cancel(subscriptionId, {
        prorate: false,
        invoice_now: false,
      });
    },
    async expireOpenCheckoutSessions(customerId) {
      return stripeProvider().expireOpenCheckoutSessions(customerId);
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
