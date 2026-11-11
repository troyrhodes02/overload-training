import { NextResponse } from "next/server";
import {
  constructWebhookEvent,
  fetchSubscriptionSnapshot,
  stripeEnforceDeps,
} from "@/lib/billing/stripe";
import {
  enforceSingleSubscription,
  reconcileStripeEvent,
} from "@/lib/data/billing-webhook";

/**
 * Plans, Billing & Promo Codes — the ONE Stripe webhook endpoint (spec §11,
 * RD-6/RD-14). It is the only path where paid subscription state enters
 * Overload. It verifies the signature, then hands the event to the data-layer
 * reconciler, which dedupes by event id and reconciles the mirror to Stripe's
 * re-fetched truth (idempotent and order-safe). No session; the account is
 * resolved from the Stripe customer id, never the session or the raw payload.
 */

// Reading the raw request body (needed for signature verification) already
// forces this route to run per-request; no segment config is set, which also
// keeps it compatible with the app's cacheComponents setting.
export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch {
    // Invalid or unsigned payload — reject, write nothing.
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const input = {
    id: event.id,
    type: event.type,
    object: event.data.object as unknown as Record<string, unknown>,
  };
  try {
    await reconcileStripeEvent(input, {
      getSubscription: fetchSubscriptionSnapshot,
    });
    // One subscription per account (OVE-112): after the mirror is settled,
    // refund and cancel any duplicate and expire leftover Checkout sessions.
    // Runs on a deduped replay too, so a retry after a failure here finishes
    // the job; it is idempotent.
    await enforceSingleSubscription(input, stripeEnforceDeps());
  } catch (error) {
    // A transient failure: let Stripe retry (it will, and the dedupe ledger
    // makes the retry safe). Never leak internals.
    console.error(
      "stripe webhook: reconcile failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
