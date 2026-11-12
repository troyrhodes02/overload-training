import "server-only";
import type { Account } from "@/lib/data/account";
import { fetchSubscriptionSnapshot } from "@/lib/billing/stripe";
import { syncBillingFromStripe } from "@/lib/data/billing-webhook";

/**
 * Plans, Billing & Promo Codes — converge the billing mirror on Stripe's
 * current truth before the Plan & Billing screen is read.
 *
 * Why this exists: the mirror is maintained by webhooks, and a webhook can be
 * missed, delayed, or misconfigured (as in Preview). Without a read-time check
 * the screen would keep asserting the last webhook's state — e.g. "Pro —
 * Monthly, renews" after the lifter scheduled a cancellation in the Stripe
 * portal. Refetching on load makes the screen self-heal.
 *
 * Best-effort: it never throws. A Stripe outage or missing key must not break
 * the page; the mirror simply stays as the last webhook left it. The subscription
 * id comes from the account's own mirror (account-scoped read) and only that
 * account's own mirror is ever written.
 */
export async function refreshBillingFromStripe(
  account: Account,
): Promise<void> {
  try {
    const billing = await account.db.billingAccount.findUnique({
      where: { userId: account.userId },
      select: { subscriptionId: true },
    });
    if (!billing?.subscriptionId) return;
    await syncBillingFromStripe(
      { userId: account.userId, subscriptionId: billing.subscriptionId },
      { getSubscription: fetchSubscriptionSnapshot },
    );
  } catch (error) {
    // Never leak internals, never break the page.
    console.error(
      "billing: read-time sync failed",
      error instanceof Error ? error.name : "unknown",
    );
  }
}
