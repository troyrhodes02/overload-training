import type { Account } from "@/lib/data/account";
import type { Capability } from "@/lib/billing/config";
import { DomainError } from "@/lib/actions/result";
import { can, resolveEntitlement } from "@/lib/entitlements/resolve";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

/**
 * Server-side Pro gate for a dedicated Pro server action (spec RD-9). Throws
 * `plan_required` (402) when the capability is absent. Pro READ surfaces
 * withhold in the query layer instead of throwing; this is for mutations/actions
 * that must never run for a Free account. Hiding a control is never the gate.
 */
export async function requireCapability(
  account: Account,
  cap: Capability,
): Promise<ResolvedEntitlement> {
  const resolved = await resolveEntitlement(account);
  if (!can(resolved, cap)) {
    throw new DomainError(
      "plan_required",
      "This is part of Pro. Upgrade to use it.",
    );
  }
  return resolved;
}
