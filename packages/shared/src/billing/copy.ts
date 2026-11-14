import type { DisplayState } from "../entitlements/types";

/**
 * How an account's plan reads (moved from apps/web/src/lib/billing/screen.ts
 * in Pitch 21d, RD-22, unchanged): the web's Plan & Billing page and the iPhone
 * app's read-only plan row use the same words for the same server state.
 * Display only: access is enforced on the server from capabilities, never
 * from this text.
 */
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
