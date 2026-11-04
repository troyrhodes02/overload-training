import "server-only";
import type { Account } from "@/lib/data/account";
import { getAuthUser } from "@/lib/auth";
import { DomainError } from "@/lib/actions/result";
import {
  appUrl,
  stripeProvider,
  type BillingInterval,
  type BillingProvider,
} from "@/lib/billing/stripe";

/**
 * Plans, Billing & Promo Codes — hosted Checkout and Customer Portal entry
 * points (spec §11, §12; RD-11/RD-12).
 *
 * Checkout requires a VERIFIED email (first-checkout gate, RD-11 — this is the
 * one sanctioned reader of Profile.emailVerifiedAt outside the verification
 * module; it gates only checkout, never any Free feature). The browser return
 * from Stripe is NEVER authoritative for paid access — the subscription enters
 * only through the verified webhook (B4). Overload stores no card data.
 *
 * The provider and the session email are injectable so unit tests pass fakes;
 * production uses the real Stripe adapter and the session email.
 */

export type CheckoutDeps = {
  provider: BillingProvider;
  ownEmail: () => Promise<string | null>;
};

const defaultDeps: CheckoutDeps = {
  provider: stripeProvider(),
  ownEmail: async () => (await getAuthUser())?.email ?? null,
};

/**
 * Starts a Stripe hosted Checkout for the acting account and returns its URL.
 * Ensures a Stripe customer, persisting its id on the account's BillingAccount
 * mirror (the only non-webhook write to that row). Refuses an unverified email.
 */
export async function startCheckout(
  account: Account,
  interval: BillingInterval,
  deps: Partial<CheckoutDeps> = {},
): Promise<{ url: string }> {
  const { provider, ownEmail } = { ...defaultDeps, ...deps };

  const profile = await account.db.profile.findUnique({
    where: { userId: account.userId },
    select: { emailVerifiedAt: true },
  });
  if (!profile || profile.emailVerifiedAt === null) {
    throw new DomainError(
      "invalid_state_transition",
      "Verify your email to subscribe.",
    );
  }

  const email = await ownEmail();
  if (!email) {
    throw new DomainError("invalid_state_transition", "Sign in and try again.");
  }

  const existing = await account.db.billingAccount.findUnique({
    where: { userId: account.userId },
    select: { stripeCustomerId: true },
  });
  const customerId = await provider.ensureCustomer({
    existingCustomerId: existing?.stripeCustomerId ?? null,
    email,
    accountId: account.userId,
  });
  if (!existing) {
    await account.db.billingAccount.create({
      data: { userId: account.userId, stripeCustomerId: customerId },
    });
  }

  return provider.createCheckoutSession({
    customerId,
    interval,
    accountId: account.userId,
    successUrl: appUrl("/settings/billing?status=success"),
    cancelUrl: appUrl("/settings/billing?status=cancelled"),
  });
}

/**
 * Starts a Stripe Customer Portal session for self-service management and
 * cancellation. Requires an existing Stripe customer (i.e. a prior checkout).
 */
export async function startPortal(
  account: Account,
  deps: Partial<Pick<CheckoutDeps, "provider">> = {},
): Promise<{ url: string }> {
  const { provider } = { provider: defaultDeps.provider, ...deps };
  const existing = await account.db.billingAccount.findUnique({
    where: { userId: account.userId },
    select: { stripeCustomerId: true },
  });
  if (!existing) {
    throw new DomainError(
      "invalid_state_transition",
      "No billing to manage yet.",
    );
  }
  return provider.createPortalSession({
    customerId: existing.stripeCustomerId,
    returnUrl: appUrl("/settings/billing"),
  });
}
