import { Badge } from "@/components/ui/badge";
import type { AccountStatusValue } from "@/lib/admin/types";

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
