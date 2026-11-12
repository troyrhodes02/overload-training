import type { Capability, Plan } from "@/lib/billing/config";

/** How the lifter's single plan line reads (UI only; never enforced). */
export type DisplayState =
  | "free"
  | "trial"
  | "paid_monthly"
  | "paid_annual"
  | "comp"
  | "canceling"
  | "grace";

/** Which valid sources currently grant the account Pro. */
export type EntitlementSourceKind = "trial" | "comp" | "subscription";

/**
 * The resolved entitlement, computed on read from Entitlement rows plus the
 * BillingAccount mirror. Nothing here is stored. `plan`/`capabilities` are the
 * ENFORCED access; `displayState`/`sources`/`trialDaysLeft` drive presentation.
 */
export type ResolvedEntitlement = {
  plan: Plan;
  capabilities: ReadonlySet<Capability>;
  sources: EntitlementSourceKind[];
  displayState: DisplayState;
  trialDaysLeft: number | null;
};

export type { Capability, Plan };
