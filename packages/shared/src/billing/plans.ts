/**
 * Plans and capabilities (Plans, Billing & Promo Codes, spec 19 section 8;
 * moved from apps/web/src/lib/billing/config.ts in Pitch 21b). The plan names,
 * the named capabilities each plan grants, and the trial and grace lengths.
 *
 * Data only: which plan an account has, and whether it may use a capability,
 * is decided on the server (entitlement resolution and the gates stay in
 * apps/web). The iPhone app receives Pro results from the API and never uses
 * this map to unlock anything.
 */

import type { PlanValue } from "../enums";

/** The plan names (Prisma enum `Plan`, via the shared enum registry). */
export type Plan = PlanValue;

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
