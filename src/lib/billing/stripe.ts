import "server-only";
import Stripe from "stripe";

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
        allow_promotion_codes: true,
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
