"use server";

import { requireAccount } from "@/lib/data/account";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  checkoutOutcome,
  startCheckout,
  startPortal,
  type CheckoutOutcome,
} from "@/lib/billing/checkout";
import type { BillingInterval } from "@/lib/billing/stripe";

/**
 * Plans, Billing & Promo Codes — the lifter's billing actions (spec §11).
 * Both resolve the account from the session (never client input) and return a
 * Stripe-hosted URL the client navigates to. Checkout requires a verified email
 * (handled in startCheckout). A browser return is never treated as payment.
 */

export async function createCheckoutSessionAction(
  interval: BillingInterval,
): Promise<ActionResult<{ url: string; sessionId: string }>> {
  const account = await requireAccount();
  return toActionResult(
    () => startCheckout(account, interval),
    "Couldn't start checkout. Please try again.",
  );
}

export async function createPortalSessionAction(): Promise<
  ActionResult<{ url: string }>
> {
  const account = await requireAccount();
  return toActionResult(
    () => startPortal(account),
    "Couldn't open billing management. Please try again.",
  );
}

/**
 * Where a Checkout the lifter backed out of stands (OVE-112). The session id is
 * content the page itself received from createCheckoutSessionAction, checked
 * against the acting account's own Stripe customer; it never grants access.
 */
export async function checkoutOutcomeAction(
  sessionId: unknown,
): Promise<ActionResult<{ outcome: CheckoutOutcome }>> {
  const account = await requireAccount();
  return toActionResult(
    async () => ({ outcome: await checkoutOutcome(account, sessionId) }),
    "Couldn't check your checkout.",
  );
}
