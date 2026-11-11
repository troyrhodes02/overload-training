import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isUniqueViolation } from "@/lib/actions/result";
import { addDays, GRACE_PERIOD_DAYS } from "@/lib/billing/config";
import type { BillingInterval, SubscriptionStatus } from "@prisma/client";

/**
 * Plans, Billing & Promo Codes — the Stripe webhook reconciler (spec §6, §11;
 * RD-4/5/6/14).
 *
 * This is the ONE cross-account writer: it resolves the account from the stored
 * Stripe customer id (never from the session, never from the payload beyond the
 * verified event), so it uses the raw Prisma client and lives in the data layer
 * (a CLAUDE-named exception for "the billing webhook handler, entitlement and
 * billing records only"). Entitlement/billing records only — it never touches
 * training content.
 *
 * Idempotent and order-safe: each event id is recorded once (a replay is a
 * no-op), and every relevant event RE-FETCHES the authoritative subscription
 * from Stripe and overwrites the mirror, so a duplicate, late, or out-of-order
 * delivery converges on Stripe's current truth rather than a stale snapshot.
 */

/** The authoritative subscription state, re-fetched from Stripe (RD-6). */
export type MirrorSnapshot = {
  subscriptionId: string;
  customerId: string;
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  priceId: string | null;
  /** The applied promotion, if any, for the PromoRedemption mirror. */
  promo: {
    code: string;
    couponId: string;
    promotionCodeId: string | null;
  } | null;
};

export type StripeEventInput = {
  id: string;
  type: string;
  /** The event's primary object (checkout session, subscription, or invoice). */
  object: Record<string, unknown>;
};

export type WebhookDeps = {
  /** Re-fetch the authoritative subscription from Stripe (never trust the payload). */
  getSubscription: (subscriptionId: string) => Promise<MirrorSnapshot | null>;
  now?: () => Date;
};

/**
 * Statuses where a subscription has been paid for (or is being collected on)
 * and grants or held Pro. The account's mirrored subscription is kept while it
 * is in one of these; any other open subscription for the same customer is a
 * duplicate (OVE-112). `incomplete` (first payment never confirmed) is not
 * established: a paid subscription may replace it.
 */
const ESTABLISHED = new Set<SubscriptionStatus>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
]);

export function isEstablished(status: SubscriptionStatus | null | undefined) {
  return status != null && ESTABLISHED.has(status);
}

export type WebhookOutcome =
  | { status: "duplicate" }
  | { status: "ignored"; reason: string }
  | { status: "processed"; userId: string };

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** The subscription id on an Invoice object. In Stripe API 2026-10-28 it moved
 *  from the top-level `invoice.subscription` to
 *  `invoice.parent.subscription_details.subscription`; read the new location
 *  first and fall back to the legacy field for older shapes. */
function invoiceSubscriptionId(o: Record<string, unknown>): string | null {
  const parent = o.parent;
  if (parent && typeof parent === "object") {
    const details = (parent as Record<string, unknown>).subscription_details;
    if (details && typeof details === "object") {
      const sub = (details as Record<string, unknown>).subscription;
      const id = asString(sub);
      if (id) return id;
    }
  }
  return asString(o.subscription);
}

/** Pull the subscription id, customer id, and (checkout only) account id. */
function identify(event: StripeEventInput): {
  subscriptionId: string | null;
  customerId: string | null;
  clientReferenceId: string | null;
} {
  const o = event.object;
  let subscriptionId: string | null;
  if (event.type.startsWith("customer.subscription")) {
    subscriptionId = asString(o.id);
  } else if (event.type.startsWith("invoice.")) {
    subscriptionId = invoiceSubscriptionId(o);
  } else {
    // checkout.session.completed carries the subscription id directly.
    subscriptionId = asString(o.subscription);
  }
  return {
    subscriptionId,
    customerId: asString(o.customer),
    clientReferenceId: asString(o.client_reference_id),
  };
}

export async function reconcileStripeEvent(
  event: StripeEventInput,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  const now = deps.now ?? (() => new Date());

  return prisma.$transaction(async (tx) => {
    // Idempotency: the event-id ledger. A replay collides and is a no-op.
    try {
      await tx.webhookEvent.create({
        data: { id: event.id, type: event.type },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return { status: "duplicate" as const };
      throw e;
    }

    if (!HANDLED.has(event.type)) {
      return { status: "ignored" as const, reason: "unhandled_type" };
    }

    const { subscriptionId, customerId, clientReferenceId } = identify(event);
    if (!customerId) {
      return { status: "ignored" as const, reason: "no_customer" };
    }

    // Serialize every event for this customer (OVE-112): two subscriptions'
    // first events can't interleave and both claim the mirror.
    await tx.$queryRaw`
      SELECT "user_id" FROM "billing_accounts"
      WHERE "stripe_customer_id" = ${customerId}
      FOR UPDATE`;

    // Resolve the account from the stored customer id. The one time we accept
    // client_reference_id is to establish the FIRST link, and only when it names
    // a real account; a customer already linked to another account is never
    // reassigned from the payload.
    const existing = await tx.billingAccount.findUnique({
      where: { stripeCustomerId: customerId },
      select: { userId: true, subscriptionId: true, status: true },
    });
    let userId = existing?.userId ?? null;
    if (!userId && clientReferenceId) {
      const profile = await tx.profile.findUnique({
        where: { userId: clientReferenceId },
        select: { userId: true },
      });
      if (!profile) {
        return { status: "ignored" as const, reason: "unknown_account" };
      }
      userId = profile.userId;
    }
    if (!userId) {
      return { status: "ignored" as const, reason: "unresolved_account" };
    }

    // Re-fetch Stripe's current truth for the subscription (RD-6). Without one
    // (e.g. a checkout session that only linked the customer), just ensure the
    // customer link exists and stop.
    const snap = subscriptionId
      ? await deps.getSubscription(subscriptionId)
      : null;
    if (!snap) {
      await tx.billingAccount.upsert({
        where: { userId },
        create: { userId, stripeCustomerId: customerId },
        update: { stripeCustomerId: customerId },
      });
      return { status: "processed" as const, userId };
    }

    // One subscription per account (OVE-112). While the mirror holds an
    // established subscription, another subscription's events never replace
    // it: that subscription is a duplicate (two Checkout tabs both paid), and
    // enforceSingleSubscription refunds and cancels it. The mirrored one is
    // re-read from Stripe first, so a stale "active" never blocks a genuine
    // resubscription after the old one ended.
    if (
      existing?.subscriptionId &&
      existing.subscriptionId !== snap.subscriptionId &&
      isEstablished(existing.status)
    ) {
      const current = await deps.getSubscription(existing.subscriptionId);
      if (current && isEstablished(current.status)) {
        return { status: "ignored" as const, reason: "duplicate_subscription" };
      }
    }

    await applyMirrorSnapshot(tx, userId, snap, now);
    return { status: "processed" as const, userId };
  });
}

/** One open Stripe subscription, as the duplicate guard needs it. */
export type OpenSubscription = {
  id: string;
  status: SubscriptionStatus;
  latestInvoiceId: string | null;
};

export type EnforceDeps = {
  /** The customer's subscriptions in Stripe that are not over. */
  listOpenSubscriptions: (customerId: string) => Promise<OpenSubscription[]>;
  /** Refund every paid payment on an invoice (idempotent). Returns the count. */
  refundInvoice: (invoiceId: string) => Promise<number>;
  /** Cancel a subscription now, without proration or a final invoice. */
  cancelSubscription: (subscriptionId: string) => Promise<void>;
  /** Expire the customer's still-open hosted Checkout sessions. */
  expireOpenCheckoutSessions: (customerId: string) => Promise<number>;
};

export type EnforceOutcome = {
  status: "skipped" | "enforced";
  refunded: string[];
  canceled: string[];
  expiredSessions: number;
};

/** Event types after which the single-subscription rule is enforced. */
const ENFORCE_ON = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "invoice.paid",
]);

/**
 * Enforce one subscription per account (OVE-112) after a webhook event.
 *
 * Checkout prevention (the per-account lock, the open-subscription check,
 * expiring older sessions) leaves one gap: a lifter pays in one tab while
 * another tab already holds a newer session. This closes it on Stripe's side:
 *
 *   1. Once the account's mirrored subscription is established, every other
 *      open Checkout session for the customer is expired, so a lingering tab
 *      can no longer be paid.
 *   2. Any OTHER open subscription for the customer is a duplicate: its paid
 *      invoice is refunded in full, then it is canceled immediately (no
 *      proration, no final invoice). Refund first, so a failure between the
 *      two steps is retried (Stripe redelivers) rather than leaving a canceled
 *      but charged duplicate. Refunds use idempotency keys.
 *
 * Runs OUTSIDE the reconcile transaction (Stripe network calls) and after it,
 * for every relevant delivery including a deduped replay, so a retry after a
 * failure here still finishes the job. Idempotent: an already-canceled
 * duplicate is no longer open and is not touched again. Entitlement and
 * billing records only; the account is resolved from the stored customer id.
 */
export async function enforceSingleSubscription(
  event: StripeEventInput,
  deps: EnforceDeps,
): Promise<EnforceOutcome> {
  const none: EnforceOutcome = {
    status: "skipped",
    refunded: [],
    canceled: [],
    expiredSessions: 0,
  };
  if (!ENFORCE_ON.has(event.type)) return none;
  const { customerId } = identify(event);
  if (!customerId) return none;

  const mirror = await prisma.billingAccount.findUnique({
    where: { stripeCustomerId: customerId },
    select: { subscriptionId: true, status: true },
  });
  if (!mirror?.subscriptionId || !isEstablished(mirror.status)) return none;
  const keep = mirror.subscriptionId;

  const expiredSessions = await deps.expireOpenCheckoutSessions(customerId);

  const refunded: string[] = [];
  const canceled: string[] = [];
  for (const sub of await deps.listOpenSubscriptions(customerId)) {
    if (sub.id === keep) continue;
    if (sub.latestInvoiceId) {
      const n = await deps.refundInvoice(sub.latestInvoiceId);
      if (n > 0) refunded.push(sub.id);
    }
    await deps.cancelSubscription(sub.id);
    canceled.push(sub.id);
    console.warn("billing: canceled a duplicate subscription", {
      kept: keep,
      canceled: sub.id,
    });
  }
  return { status: "enforced", refunded, canceled, expiredSessions };
}

/**
 * Write Stripe's re-fetched truth onto an account's billing mirror (and mirror
 * any promotion once). Shared by the webhook reconciler and the read-time sync
 * so both converge on exactly the same persisted state. Scoped to one account:
 * it only ever writes `userId`'s own mirror, never another account's.
 */
async function applyMirrorSnapshot(
  tx: Prisma.TransactionClient,
  userId: string,
  snap: MirrorSnapshot,
  now: () => Date,
): Promise<void> {
  // Grace: set the window the first time we see past_due; clear it otherwise.
  const prior = await tx.billingAccount.findUnique({
    where: { userId },
    select: { graceEndsAt: true },
  });
  let graceEndsAt: Date | null = null;
  if (snap.status === "past_due") {
    graceEndsAt = prior?.graceEndsAt ?? addDays(now(), GRACE_PERIOD_DAYS);
  }

  const fields = {
    stripeCustomerId: snap.customerId,
    subscriptionId: snap.subscriptionId,
    status: snap.status,
    interval: snap.interval,
    currentPeriodEnd: snap.currentPeriodEnd,
    cancelAtPeriodEnd: snap.cancelAtPeriodEnd,
    graceEndsAt,
    priceId: snap.priceId,
    promoCode: snap.promo?.code ?? null,
  };
  await tx.billingAccount.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: fields,
  });

  // Mirror the promotion once per (account, code).
  if (snap.promo) {
    const already = await tx.promoRedemption.findUnique({
      where: { userId_code: { userId, code: snap.promo.code } },
      select: { id: true },
    });
    if (!already) {
      await tx.promoRedemption.create({
        data: {
          userId,
          code: snap.promo.code,
          couponId: snap.promo.couponId,
          promotionCodeId: snap.promo.promotionCodeId,
          subscriptionId: snap.subscriptionId,
          redeemedAt: now(),
        },
      });
    }
  }
}

/**
 * Read-time safety net: re-fetch an account's subscription from Stripe and
 * reconcile its mirror, so a missed, delayed, or out-of-order webhook does not
 * leave the Plan & Billing screen asserting a stale state (the reported bug: a
 * scheduled cancellation that still read "renews"). Reconcile-to-truth, so it
 * is idempotent and converges regardless of delivery order. Resolves nothing
 * from client input: the caller passes the acting account's own `userId` and
 * its stored `subscriptionId`, and only that account's mirror is written.
 */
export async function syncBillingFromStripe(
  input: { userId: string; subscriptionId: string },
  deps: WebhookDeps,
): Promise<{ status: "synced" | "unavailable" }> {
  const snap = await deps.getSubscription(input.subscriptionId);
  if (!snap) return { status: "unavailable" };
  const now = deps.now ?? (() => new Date());
  await prisma.$transaction((tx) =>
    applyMirrorSnapshot(tx, input.userId, snap, now),
  );
  return { status: "synced" };
}
