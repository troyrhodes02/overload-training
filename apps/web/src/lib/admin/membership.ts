import type { EntitlementSourceKind } from "@/lib/entitlements/types";
import type { MembershipValue } from "./types";

/**
 * An account's plan as the admin directory labels it (Workout Logging
 * Refinements RD-11; roadmap chore "admin membership visibility"). Pure: the
 * input is the resolved entitlement's valid sources (computeEntitlement), so
 * the label can never disagree with what the account can actually use.
 *
 * Precedence matches the account page's billing panel (getAccountBilling):
 * a paying subscription (incl. canceling and the grace window) → "pro"; else
 * owner-granted complimentary access → "comped"; else an active trial →
 * "trial" (shown as Pro, noted as a trial); else "free". A comp is never
 * labelled or counted as a paying subscriber.
 */
export function membershipOf(
  sources: readonly EntitlementSourceKind[],
): MembershipValue {
  if (sources.includes("subscription")) return "pro";
  if (sources.includes("comp")) return "comped";
  if (sources.includes("trial")) return "trial";
  return "free";
}
