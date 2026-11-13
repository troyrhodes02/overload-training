/**
 * Plans, Billing & Promo Codes (spec 19 section 8) — billing constants.
 *
 * These are the one place the trial length, grace window, plan-capability
 * mapping, and display prices live. The values marked "owner-confirm" are
 * configurable defaults the owner confirms before LIVE billing is enabled;
 * nothing here switches Stripe to live mode. Price IDs come from env at
 * runtime (test mode); the strings below are display-only.
 */

export type Plan = "free" | "pro";

/**
 * Named product capabilities (spec RD-1). Server code checks these, never a
 * plan name. Free grants none; Pro grants all. Capabilities grant features,
 * never permissions or admin.
 */
export type Capability =
  | "progression_insights" // progress/hold/deload call, evidence, suggested load, stall gate, RIR qualifiers
  | "e1rm_trends" // e1RM/weight trend + best-e1RM record
  | "exercise_history_intelligence" // per-session calls + rep-record frontier
  | "plan_import"; // Workout Plan Import & Review (Pitch 22), behind its kill switch

export const ALL_CAPABILITIES: readonly Capability[] = [
  "progression_insights",
  "e1rm_trends",
  "exercise_history_intelligence",
  "plan_import",
];

/** Which capabilities each plan grants. Later Pro additions are Pro by default. */
export const PLAN_CAPABILITIES: Record<Plan, readonly Capability[]> = {
  free: [],
  pro: ALL_CAPABILITIES,
};

/** 14-day card-free trial from signup (pitch decision #3, owner-confirmed). */
export const TRIAL_DURATION_DAYS = 14;

/**
 * Failed-payment grace (pitch 4.13 / RD-5): a configurable default the owner
 * confirms before live billing. During grace a past_due subscription still
 * grants Pro.
 */
export const GRACE_PERIOD_DAYS = 7;

/** Display-only price strings (RD-8). Authoritative amounts live in Stripe. */
export const PRICE_DISPLAY = {
  monthly: "$4.99",
  annual: "$39.99",
} as const;

/**
 * The creator promotion (RD-7; OVE-112). Display only: the authoritative terms
 * live on the Stripe coupon and promotion code, which code never creates,
 * changes, or redeems. The coupon is 25% off the Overload Pro PRODUCT for a
 * three-month duration, so on monthly it discounts the first three monthly
 * payments and on annual it discounts only the first annual payment (the next
 * annual renewal falls after the three months). It is promoted only on the
 * creator's /blizzy page, never on the generic pricing or upgrade surfaces.
 */
export const BLIZZY = {
  code: "BLIZZY",
  percentOff: 25,
  durationMonths: 3,
  terms:
    "25% off Pro for three months: the first three monthly payments, or the first annual payment",
  maxRedemptions: 200,
} as const;

/**
 * Server-side billing kill switch. Paid checkout is OFF unless
 * `STRIPE_BILLING_ENABLED` is exactly "true" — so a production deploy with the
 * flag unset (the default until the launch pitch) cannot start a checkout or
 * take a payment even if Stripe keys are present. Dev/preview set it to "true"
 * to test against the Stripe test sandbox. This is the single switch; both the
 * screen (hides Subscribe, shows a plain note) and the checkout entry point
 * (refuses before any Stripe call) read it, so the UI and the server agree.
 */
export function isCheckoutEnabled(): boolean {
  return process.env.STRIPE_BILLING_ENABLED === "true";
}

/** The existing plan-selection flow: every upgrade invitation links here. */
export const UPGRADE_HREF = "/settings/billing";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}
