import type { MePlanDto } from "@overload/shared/contracts/account";

/**
 * A3 Plan & access's rows (Pitch 21j design §6 A3; RD-15). The label, the
 * explanation, and the Pro lines are the server's words; this only chooses
 * the headings. Nothing here offers a purchase.
 */

/** Always Free, on every plan (CLAUDE.md: capture, history, export). */
export const FREE_ALWAYS = [
  "Logging every set",
  "Your full history",
  "Your data export",
] as const;

export const BILLING_FOOTNOTE =
  "Plans and billing are managed on the Overload website.";

export function planSections(plan: MePlanDto): {
  proHeading: string;
  proLines: string[];
  problemBanner: string | null;
} {
  return {
    proHeading:
      plan.displayState === "free" ? "Pro adds" : "Included in your plan",
    proLines: plan.proIncludes,
    problemBanner: plan.problem ? "We couldn't take your last payment." : null,
  };
}
