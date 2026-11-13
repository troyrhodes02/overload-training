import { Badge } from "@/components/ui/badge";
import type { AccountStatusValue, MembershipValue } from "@/lib/admin/types";

/**
 * Account status (design doc §4): an active account is a non-event (plain
 * muted text); a suspended one gets the destructive-outline badge, with the
 * word, never color alone.
 */
export function AccountStatusBadge({ status }: { status: AccountStatusValue }) {
  return status === "suspended" ? (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      Suspended
    </Badge>
  ) : (
    <span className="text-sm text-muted-foreground">Active</span>
  );
}

export function AdminBadge() {
  return <Badge variant="outline">Admin</Badge>;
}

/**
 * An account's plan in the directory (Workout Logging Refinements design
 * Screen 4; RD-11). Words, never color alone: Pro is an outline badge, a trial
 * is Pro with a muted "trial" note (a trial is not a paying subscriber),
 * Comped is the secondary badge, and Free is plain muted text — a non-event,
 * like "Active".
 */
export function PlanBadge({ membership }: { membership: MembershipValue }) {
  if (membership === "free")
    return <span className="text-sm text-muted-foreground">Free</span>;
  if (membership === "comped") return <Badge variant="secondary">Comped</Badge>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline">Pro</Badge>
      {membership === "trial" ? (
        <span className="text-xs text-muted-foreground">trial</span>
      ) : null}
    </span>
  );
}
