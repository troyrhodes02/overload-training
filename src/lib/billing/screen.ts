import "server-only";
import type { Account } from "@/lib/data/account";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { PRICE_DISPLAY } from "@/lib/billing/config";
import type { DisplayState } from "@/lib/entitlements/types";

/**
 * Plans, Billing & Promo Codes — the Plan & Billing screen DTO (spec §13,
 * design Screen 1/5). Pure presentation derived from the resolved entitlement
 * plus the account's email-verified fact, whether a Stripe customer exists, and
 * the subscription's period end. The label/explanation copy lives here, so the
 * lifter screen, the Settings sub-label, and the admin view never diverge on
 * how a state reads. Dates are the real period end from the Stripe mirror,
 * rendered as the UTC calendar date to match Stripe — never hardcoded.
 */

export type BillingScreenDto = {
  displayState: DisplayState;
  label: string;
  shortLabel: string;
  explanation: string;
  canSubscribe: boolean;
  canManage: boolean;
  emailVerified: boolean;
  trialDaysLeft: number | null;
  prices: { monthly: string; annual: string };
  problem: boolean;
  /** Whether a cancellation is scheduled at period end (from the Stripe mirror). */
  cancelAtPeriodEnd: boolean;
  /** The subscription's period-end date, as the UTC calendar date (matches Stripe), or null. */
  endsOn: string | null;
};

export type BillingCopyInput = {
  trialDaysLeft: number | null;
  /** The real period-end date ("December 4, 2026"), or null when there is none. */
  endsOn: string | null;
};

/** The label / short label / explanation for a resolved billing state. */
export function billingCopy(
  state: DisplayState,
  { trialDaysLeft, endsOn }: BillingCopyInput,
): { label: string; shortLabel: string; explanation: string } {
  switch (state) {
    case "trial":
      return {
        label: `Pro — trial · ${trialDaysLeft ?? 0} days left`,
        shortLabel: `Pro — trial · ${trialDaysLeft ?? 0}d`,
        explanation:
          "You have full Pro during your trial. After it ends you move to Free, with nothing lost.",
      };
    case "paid_monthly":
      return {
        label: "Pro — Monthly",
        shortLabel: "Pro — Monthly",
        explanation: endsOn
          ? `Renews monthly on ${endsOn}. Manage or cancel anytime.`
          : "Renews monthly. Manage or cancel anytime.",
      };
    case "paid_annual":
      return {
        label: "Pro — Annual",
        shortLabel: "Pro — Annual",
        explanation: endsOn
          ? `Renews yearly on ${endsOn}. Manage or cancel anytime.`
          : "Renews yearly. Manage or cancel anytime.",
      };
    case "comp":
      return {
        label: "Pro — complimentary",
        shortLabel: "Pro — complimentary",
        explanation:
          "You have complimentary Pro. There's nothing to pay or cancel.",
      };
    case "canceling":
      return {
        label: "Pro — cancellation scheduled",
        shortLabel: "Pro — ending",
        explanation: endsOn
          ? `Cancellation scheduled. Your subscription ends on ${endsOn}. You won't be charged for another renewal — you keep Pro until then, after which your account moves to Free.`
          : "Cancellation scheduled. You keep Pro until the end of the current period, after which your account moves to Free. You won't be charged for another renewal.",
      };
    case "grace":
      return {
        label: "Payment problem",
        shortLabel: "Payment problem",
        explanation:
          "We couldn't take your last payment. Update it to keep Pro — nothing is lost either way.",
      };
    default:
      return {
        label: "Free",
        shortLabel: "Free",
        explanation:
          "You have the full training tracker. Pro adds Overload's reading of your training.",
      };
  }
}

/**
 * A subscription period-end instant as a user-facing calendar date.
 *
 * Billing dates are rendered in UTC, not the account's timezone. The renewal /
 * cancellation date is a Stripe billing fact, and Stripe shows the UTC calendar
 * date of the instant; formatting the same instant in a UTC-negative timezone
 * (e.g. America/Chicago) would roll a near-midnight-UTC period end back a day
 * and disagree with the Stripe portal (the reported "Dec 3 vs Dec 4" bug).
 * This is deliberately NOT the account timezone used for "today" and greetings.
 */
export function formatEndsOn(instant: Date | null): string | null {
  if (!instant) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(instant);
}

export async function getBillingScreen(
  account: Account,
): Promise<BillingScreenDto> {
  const [resolved, profile, billing] = await Promise.all([
    resolveEntitlement(account),
    account.db.profile.findUnique({
      where: { userId: account.userId },
      select: { emailVerifiedAt: true },
    }),
    account.db.billingAccount.findUnique({
      where: { userId: account.userId },
      select: {
        stripeCustomerId: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
      },
    }),
  ]);

  const state = resolved.displayState;
  const endsOn = formatEndsOn(billing?.currentPeriodEnd ?? null);
  const copy = billingCopy(state, {
    trialDaysLeft: resolved.trialDaysLeft,
    endsOn,
  });
  const canSubscribe = state === "free" || state === "trial";

  return {
    displayState: state,
    label: copy.label,
    shortLabel: copy.shortLabel,
    explanation: copy.explanation,
    canSubscribe,
    canManage: billing?.stripeCustomerId != null,
    emailVerified: profile?.emailVerifiedAt != null,
    trialDaysLeft: resolved.trialDaysLeft,
    prices: { monthly: PRICE_DISPLAY.monthly, annual: PRICE_DISPLAY.annual },
    problem: state === "grace",
    cancelAtPeriodEnd: billing?.cancelAtPeriodEnd ?? false,
    endsOn,
  };
}
