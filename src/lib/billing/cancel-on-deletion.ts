import "server-only";
import type { Account } from "@/lib/data/account";

/**
 * Cancel billing before an account is deleted (OVE-122 / audit F-A2; Plans &
 * Billing spec RD-16).
 *
 * Deleting an account removes Overload's Stripe mirror (`BillingAccount`), so
 * after deletion no webhook can resolve the account and no portal is left to
 * cancel from. A subscription that outlived the account would keep charging a
 * person who no longer has an Overload account. So, BEFORE any data is
 * deleted, every subscription on the account's Stripe customer that is not
 * already over is canceled immediately:
 *
 *  - no proration and no final invoice (`prorate: false`, `invoice_now:
 *    false`), so there are no further charges; no automatic refund (refunds
 *    are handled by support); the Stripe customer itself is kept, so Stripe
 *    keeps its records;
 *  - read from Stripe, not the mirror, so a just-paid subscription whose
 *    webhook has not landed yet is still canceled;
 *  - retry-safe: subscriptions already canceled are skipped, so a retry after
 *    a partial failure finishes the job instead of failing on the first one.
 *
 * If anything here fails, `deleteAccount` stops before deleting anything and
 * the account stays fully intact. If Stripe is not configured in this
 * environment but the mirror says a subscription exists, deletion is REFUSED
 * rather than deleting without cancelling. With no Stripe customer, or a
 * customer with nothing to cancel, deletion proceeds exactly as before.
 */

export type DeletionBillingDeps = {
  /**
   * Cancels every not-yet-over subscription on the customer, immediately.
   * Returns the ids it canceled. Null when Stripe is not configured in this
   * environment.
   */
  cancelAllSubscriptions:
    ((customerId: string) => Promise<{ canceled: string[] }>) | null;
};

/** Thrown when billing could not be canceled; nothing has been deleted. */
export class SubscriptionCancellationError extends Error {
  constructor(reason: "not_configured" | "stripe_failed") {
    super(
      reason === "not_configured"
        ? "Billing isn't configured here, so the subscription can't be canceled."
        : "The subscription couldn't be canceled.",
    );
    this.name = "SubscriptionCancellationError";
  }
}

/** Mirror statuses that mean the subscription is already over. */
const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * Cancel the acting account's subscriptions before deletion. Reads only the
 * acting account's own mirror row (account-scoped). Throws
 * SubscriptionCancellationError on any failure; returns what it canceled.
 */
export async function cancelSubscriptionsBeforeDeletion(
  account: Account,
  deps: DeletionBillingDeps,
): Promise<{ canceled: string[] }> {
  const billing = await account.db.billingAccount.findUnique({
    where: { userId: account.userId },
    select: { stripeCustomerId: true, subscriptionId: true, status: true },
  });
  // No Stripe customer: nothing can be charged. Proceed as before.
  if (!billing) return { canceled: [] };

  const mirrorSaysSubscribed =
    billing.subscriptionId !== null &&
    !(billing.status !== null && ENDED_STATUSES.has(billing.status));

  if (!deps.cancelAllSubscriptions) {
    // Without Stripe there is no way to cancel. Never delete an account that
    // may still be paying; a customer with no subscription on record is safe.
    if (mirrorSaysSubscribed) {
      throw new SubscriptionCancellationError("not_configured");
    }
    return { canceled: [] };
  }

  try {
    return await deps.cancelAllSubscriptions(billing.stripeCustomerId);
  } catch (error) {
    console.error(
      "account deletion: subscription cancel failed; nothing was deleted",
      error instanceof Error ? error.name : "unknown",
    );
    throw new SubscriptionCancellationError("stripe_failed");
  }
}
