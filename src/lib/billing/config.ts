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
  | "plan_import"; // reserved for the later Plan Import pitch; unused here

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

/** The first promotional campaign (RD-7). Terms configured in Stripe (runbook). */
export const BLIZZY = {
  code: "BLIZZY",
  terms: "50% off for 3 months, then the regular monthly price",
  maxRedemptions: 200,
} as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}
