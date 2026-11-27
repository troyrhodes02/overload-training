import type { Capability, Plan } from "../billing/plans";

/**
 * How the lifter's single plan line reads (UI only; never enforced).
 *
 * `included` (OVE-266) is the free-Pro period: Pro is included for everyone
 * at no charge while the server switch is on. It replaces only the `free` and
 * `trial` lines; comp and subscription states keep their own. An app build
 * that predates it reads it through `billingCopy`'s default (the Free words),
 * so the value is additive and never breaks an installed client.
 */
export type DisplayState =
  | "free"
  | "included"
  | "trial"
  | "paid_monthly"
  | "paid_annual"
  | "comp"
  | "canceling"
  | "grace";

/**
 * Which valid sources currently grant the account Pro. Only an account's own
 * records: the free-Pro period (OVE-266) is not a source, so an account it
 * covers reads `plan: "pro"` with whatever real sources it has, possibly none.
 */
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
