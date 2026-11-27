/**
 * Plans, Billing & Promo Codes (spec 19 section 8) — billing constants.
 *
 * These are the one place the trial length, grace window, plan-capability
 * mapping, and display prices live. The values marked "owner-confirm" are
 * configurable defaults the owner confirms before LIVE billing is enabled;
 * nothing here switches Stripe to live mode. Price IDs come from env at
 * runtime (test mode); the strings below are display-only.
 */

// Plan names, capabilities, the plan-capability map, and the trial and grace
// lengths live in the shared package (Pitch 21b); re-exported here so existing
// importers are unchanged. The rest of this module is web- or server-only.
export {
  ALL_CAPABILITIES,
  GRACE_PERIOD_DAYS,
  PLAN_CAPABILITIES,
  TRIAL_DURATION_DAYS,
  type Capability,
  type Plan,
} from "@overload/shared/billing/plans";

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
  return process.env.STRIPE_BILLING_ENABLED === "true" && !isFreeProPeriod();
}

/**
 * The free-Pro period (OVE-266): a temporary, reversible, server-only switch.
 * While `OVERLOAD_FREE_PRO_PERIOD` is exactly "true", the entitlement resolver
 * grants Pro to every account and paid checkout is off (it outranks
 * `STRIPE_BILLING_ENABLED`, above). Any other value, including unset, is the
 * normal rules, so a missing or mistyped value can never open checkout and
 * never leaves Pro on by accident.
 *
 * Nothing is stored because of it: no Entitlement row, no trial or comp
 * change, no Stripe call. Turning it off returns every account to exactly what
 * its own records give it. The resolver (`resolveEntitlement`) and the
 * checkout switch above are its only readers outside billing presentation.
 */
export function isFreeProPeriod(): boolean {
  return process.env.OVERLOAD_FREE_PRO_PERIOD === "true";
}

/** The existing plan-selection flow: every upgrade invitation links here. */
export const UPGRADE_HREF = "/settings/billing";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}
