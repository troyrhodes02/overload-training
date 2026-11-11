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
import { isCheckoutEnabled } from "@/lib/billing/config";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { lockCheckoutForAccount } from "@/lib/data/locks";
import { isAppShellRequest } from "@/lib/platform/request";

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
 * The provider, the session email, the app-shell check, and the clock are
 * injectable so unit tests pass fakes; production uses the real Stripe
 * adapter, the session email, and the request's user agent.
 */

export type CheckoutDeps = {
  provider: BillingProvider;
  ownEmail: () => Promise<string | null>;
  /** Whether the request comes from an app shell (no purchase flow there). */
  inAppShell: () => Promise<boolean>;
  now: () => Date;
};

const defaultDeps: CheckoutDeps = {
  provider: stripeProvider(),
  ownEmail: async () => (await getAuthUser())?.email ?? null,
  inAppShell: isAppShellRequest,
  now: () => new Date(),
};

/** Plan states that may start a checkout: the same rule the screen uses. */
const SUBSCRIBABLE = new Set(["free", "trial"]);

/** Generous: the locked section makes up to four short Stripe calls. */
const CHECKOUT_TX = { maxWait: 10_000, timeout: 30_000 } as const;

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
  const { provider, ownEmail, inAppShell, now } = { ...defaultDeps, ...deps };

  // Kill switch (safe by default): refuse before touching Stripe, so a deploy
  // with billing disabled can never start a checkout or use a Stripe key — even
  // if a client calls this action directly.
  if (!isCheckoutEnabled()) {
    throw new DomainError(
      "invalid_state_transition",
      "Pro subscriptions aren’t available yet.",
    );
  }

  // No purchase flow inside an app shell until the store billing path is
  // decided (OVE-112). The shell shows the plan read-only; this is the gate.
  if (await inAppShell()) {
    throw new DomainError(
      "invalid_state_transition",
      "Plan changes aren’t available in the app.",
    );
  }

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

  // Only Free and an active free trial may subscribe (OVE-112). A paid,
  // canceling, or past-due subscription manages billing in the portal, and
  // complimentary access is never solicited for payment. This mirrors the
  // screen's rule on the server, so calling the action directly can't buy a
  // second subscription. Starting checkout changes no entitlement: the trial
  // stays exactly as it was until a verified webhook records a subscription.
  const resolved = await resolveEntitlement(account, now());
  if (!SUBSCRIBABLE.has(resolved.displayState)) {
    throw new DomainError(
      "invalid_state_transition",
      resolved.displayState === "comp"
        ? "You already have complimentary Pro. There’s nothing to pay."
        : "You already have a Pro subscription. Manage it in Manage billing.",
    );
  }

  // One checkout at a time per account (OVE-112). Both steps hold the
  // account's checkout lock, which serializes double clicks, two tabs, and
  // retries. Step 1 links the Stripe customer and commits that link on its
  // own, so a later Stripe failure never orphans a customer. Step 2 refuses
  // when Stripe already has an open subscription and expires any older open
  // session before creating the new one, so at most one can ever be paid.
  const customerId = await account.db.$transaction(async (tx) => {
    await lockCheckoutForAccount(account, tx);
    const existing = await tx.billingAccount.findUnique({
      where: { userId: account.userId },
      select: { stripeCustomerId: true },
    });
    if (existing) return existing.stripeCustomerId;
    const created = await provider.ensureCustomer({
      existingCustomerId: null,
      email,
      accountId: account.userId,
    });
    await tx.billingAccount.create({
      data: { userId: account.userId, stripeCustomerId: created },
    });
    return created;
  }, CHECKOUT_TX);

  return account.db.$transaction(async (tx) => {
    await lockCheckoutForAccount(account, tx);
    // Stripe's own truth, not the mirror: a subscription paid moments ago
    // whose webhook hasn't landed yet still blocks a second purchase.
    if (await provider.hasOpenSubscription(customerId)) {
      throw new DomainError(
        "invalid_state_transition",
        "You already have a Pro subscription. It can take a minute to show here.",
      );
    }
    await provider.expireOpenCheckoutSessions(customerId);
    return provider.createCheckoutSession({
      customerId,
      interval,
      accountId: account.userId,
      successUrl: appUrl("/settings/billing?status=success"),
      cancelUrl: appUrl("/settings/billing?status=cancelled"),
    });
  }, CHECKOUT_TX);
}

/**
 * Starts a Stripe Customer Portal session for self-service management and
 * cancellation. Requires an existing Stripe customer (i.e. a prior checkout).
 */
export async function startPortal(
  account: Account,
  deps: Partial<Pick<CheckoutDeps, "provider" | "inAppShell">> = {},
): Promise<{ url: string }> {
  const { provider, inAppShell } = {
    provider: defaultDeps.provider,
    inAppShell: defaultDeps.inAppShell,
    ...deps,
  };
  // The portal can change a plan or start a payment, so like Checkout it is
  // web-only until the store billing path is decided (OVE-112).
  if (await inAppShell()) {
    throw new DomainError(
      "invalid_state_transition",
      "Billing can’t be managed in the app.",
    );
  }
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
