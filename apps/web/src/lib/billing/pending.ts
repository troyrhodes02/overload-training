import type { DisplayState } from "@overload/shared/entitlements/types";

/**
 * Plans, Billing & Promo Codes — the checkout-return "finishing up" indicator
 * (design Screen 1, success return). It must bridge ONLY the gap between a
 * browser return from hosted Checkout and the verified webhook that records the
 * subscription — never persist once the subscription is confirmed, and never
 * appear on an ordinary load.
 */

/** The `?status` the browser returns from hosted Checkout with. */
export type CheckoutReturnStatus = "success" | "cancelled" | null;

/** Display states that mean a Stripe subscription is reflected in the mirror. */
const SUBSCRIPTION_STATES: readonly DisplayState[] = [
  "paid_monthly",
  "paid_annual",
  "canceling",
  "grace",
];

/** Is a Stripe subscription already recognized for this account? */
export function subscriptionConfirmed(displayState: DisplayState): boolean {
  return SUBSCRIPTION_STATES.includes(displayState);
}

/**
 * Show the "finishing up — confirming your subscription" indicator ONLY right
 * after a checkout success return AND before the subscription shows up in the
 * resolved state. Once the webhook has recorded the subscription (any paid /
 * canceling / grace state), this is false, so the indicator clears — including
 * on a later load where `?status=success` is still in the URL. A cancelled or
 * ordinary return (status !== "success") never shows it.
 */
export function isConfirmingCheckout(
  status: CheckoutReturnStatus,
  displayState: DisplayState,
): boolean {
  return status === "success" && !subscriptionConfirmed(displayState);
}
