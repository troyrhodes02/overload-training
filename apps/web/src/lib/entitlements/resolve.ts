import { cache } from "react";
import type { BillingAccount, Entitlement } from "@prisma/client";

import type { Account } from "@/lib/data/account";
import {
  MS_PER_DAY,
  PLAN_CAPABILITIES,
  type Capability,
  type Plan,
} from "@/lib/billing/config";
import type {
  DisplayState,
  EntitlementSourceKind,
  ResolvedEntitlement,
} from "@/lib/entitlements/types";

/** Capabilities a plan grants, as a Set (spec RD-1). */
export function capabilitiesFor(plan: Plan): ReadonlySet<Capability> {
  return new Set(PLAN_CAPABILITIES[plan]);
}

export function can(resolved: ResolvedEntitlement, cap: Capability): boolean {
  return resolved.capabilities.has(cap);
}

/**
 * The columns the pure resolver reads, and nothing else. Callers may pass
 * whole rows; the admin layer (which must select every field it reads) passes
 * exactly these, and the compiler refuses a read of any other column.
 */
export type ResolverEntitlement = Pick<
  Entitlement,
  "source" | "revokedAt" | "startedAt" | "endsAt"
>;
export type ResolverBilling = Pick<
  BillingAccount,
  | "status"
  | "cancelAtPeriodEnd"
  | "interval"
  | "graceEndsAt"
  | "currentPeriodEnd"
>;

function trialActive(e: ResolverEntitlement, now: Date): boolean {
  return (
    e.source === "trial" &&
    e.revokedAt === null &&
    e.startedAt.getTime() <= now.getTime() &&
    e.endsAt !== null &&
    now.getTime() < e.endsAt.getTime()
  );
}

function compActive(e: ResolverEntitlement, now: Date): boolean {
  return (
    e.source === "comp" &&
    e.revokedAt === null &&
    e.startedAt.getTime() <= now.getTime() &&
    (e.endsAt === null || now.getTime() < e.endsAt.getTime())
  );
}

type SubResolution = {
  pro: boolean;
  display: "paid_monthly" | "paid_annual" | "canceling" | "grace" | null;
};

/**
 * Pro-validity from the Stripe mirror (spec section 6). active/trialing grant
 * Pro (canceling if set to cancel at period end); past_due grants Pro only
 * within the grace window; everything else grants nothing.
 *
 * A subscription set to cancel at period end is Pro only UNTIL
 * `currentPeriodEnd` (spec section 6). Stripe's `deleted` event normally flips
 * the mirror to `canceled` at that instant, but a late or lost webhook must not
 * leave the account Pro on a paid-through date that has already passed, so the
 * date is checked here on read. An unknown end (null) defers to Stripe's
 * status. A renewing subscription is never cut off on its period end: Stripe
 * renews it, and a delayed `invoice.paid` must not drop a paying lifter.
 */
export function subscriptionResolution(
  billing: ResolverBilling | null,
  now: Date,
): SubResolution {
  if (!billing || billing.status === null) return { pro: false, display: null };
  switch (billing.status) {
    case "active":
    case "trialing":
      if (billing.cancelAtPeriodEnd) {
        if (
          billing.currentPeriodEnd !== null &&
          now.getTime() >= billing.currentPeriodEnd.getTime()
        ) {
          return { pro: false, display: null };
        }
        return { pro: true, display: "canceling" };
      }
      return {
        pro: true,
        display: billing.interval === "year" ? "paid_annual" : "paid_monthly",
      };
    case "past_due":
      if (
        billing.graceEndsAt !== null &&
        now.getTime() < billing.graceEndsAt.getTime()
      ) {
        return { pro: true, display: "grace" };
      }
      return { pro: false, display: null };
    default:
      // canceled, unpaid, incomplete, incomplete_expired, paused
      return { pro: false, display: null };
  }
}

/**
 * PURE resolution — unit-testable with no database. The async wrapper below
 * reads the rows through the account-scoped client and calls this.
 */
export function computeEntitlement(
  entitlements: ResolverEntitlement[],
  billing: ResolverBilling | null,
  now: Date,
): ResolvedEntitlement {
  const trial = entitlements.find((e) => trialActive(e, now)) ?? null;
  const hasTrial = trial !== null;
  const hasComp = entitlements.some((e) => compActive(e, now));
  const sub = subscriptionResolution(billing, now);

  const sources: EntitlementSourceKind[] = [];
  if (hasTrial) sources.push("trial");
  if (hasComp) sources.push("comp");
  if (sub.pro) sources.push("subscription");

  const plan: Plan = sources.length > 0 ? "pro" : "free";

  let displayState: DisplayState;
  if (sub.display === "grace") displayState = "grace";
  else if (sub.display === "canceling") displayState = "canceling";
  else if (sub.pro && sub.display) displayState = sub.display;
  else if (hasComp) displayState = "comp";
  else if (hasTrial) displayState = "trial";
  else displayState = "free";

  let trialDaysLeft: number | null = null;
  if (hasTrial && trial.endsAt) {
    trialDaysLeft = Math.max(
      0,
      Math.ceil((trial.endsAt.getTime() - now.getTime()) / MS_PER_DAY),
    );
  }

  return {
    plan,
    capabilities: capabilitiesFor(plan),
    sources,
    displayState,
    trialDaysLeft,
  };
}

/**
 * The account's resolved entitlement for this request. Request-cached (React
 * `cache`) so the capability read happens once across the server-component
 * tree. `now` is injectable for tests; production passes none.
 */
export const resolveEntitlement = cache(
  async (
    account: Account,
    now: Date = new Date(),
  ): Promise<ResolvedEntitlement> => {
    const [entitlements, billing] = await Promise.all([
      account.db.entitlement.findMany(),
      account.db.billingAccount.findUnique({
        where: { userId: account.userId },
      }),
    ]);
    return computeEntitlement(entitlements, billing, now);
  },
);
