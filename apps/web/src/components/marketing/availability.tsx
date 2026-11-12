import { Suspense, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getMarketingContext } from "@/lib/marketing/context";

/**
 * Billing-dependent words on the public pages (design doc §4 state colors;
 * spec RD-5). The billing switch is a request-time server fact, so these
 * stream behind a line-sized skeleton. Billing off is always said in words
 * ("Not on sale yet"), never by color, and never offers a way to pay.
 */

export function NotOnSaleBadge() {
  return (
    <Badge variant="outline" className="rounded-md text-muted-foreground">
      Not on sale yet
    </Badge>
  );
}

async function Inner({ off, on }: { off: ReactNode; on: ReactNode }) {
  const { billingEnabled } = await getMarketingContext();
  return <>{billingEnabled ? on : off}</>;
}

/** Renders `off` while billing is off and `on` once it is enabled. */
export function WhenBilling({
  off,
  on = null,
  skeleton = "line",
}: {
  off: ReactNode;
  on?: ReactNode;
  skeleton?: "line" | "none";
}) {
  return (
    <Suspense
      fallback={skeleton === "line" ? <Skeleton className="h-5 w-64" /> : null}
    >
      <Inner off={off} on={on} />
    </Suspense>
  );
}
