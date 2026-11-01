import "server-only";
import type { Account } from "@/lib/data/account";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { PRICE_DISPLAY } from "@/lib/billing/config";
import type { DisplayState } from "@/lib/entitlements/types";

/**
 * Plans, Billing & Promo Codes — the Plan & Billing screen DTO (spec §13,
 * design Screen 1/5). Pure presentation derived from the resolved entitlement
 * plus the account's email-verified fact and whether a Stripe customer exists.
 * The label/explanation copy lives here, so the lifter screen, the Settings
 * sub-label, and the admin view never diverge on how a state reads.
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
};

function copyFor(
  state: DisplayState,
  trialDaysLeft: number | null,
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
        explanation: "Renews monthly. Manage or cancel anytime.",
      };
    case "paid_annual":
      return {
        label: "Pro — Annual",
        shortLabel: "Pro — Annual",
        explanation: "Renews yearly. Manage or cancel anytime.",
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
        label: "Pro — ending soon",
        shortLabel: "Pro — ending",
        explanation:
          "Your subscription is set to cancel. You keep Pro until the period ends, then move to Free.",
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
      select: { stripeCustomerId: true },
    }),
  ]);

  const state = resolved.displayState;
  const copy = copyFor(state, resolved.trialDaysLeft);
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
  };
}
