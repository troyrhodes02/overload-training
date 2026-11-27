import { Suspense, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getMarketingContext } from "@/lib/marketing/context";
import { PRICING } from "@/lib/marketing/copy";

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

async function Inner({
  off,
  on,
  period,
}: {
  off: ReactNode;
  on: ReactNode;
  period?: ReactNode;
}) {
  const { billingEnabled, freeProPeriod } = await getMarketingContext();
  if (freeProPeriod && period !== undefined) return <>{period}</>;
  return <>{billingEnabled ? on : off}</>;
}

async function ProInner({ notOnSale }: { notOnSale: ReactNode }) {
  const { billingEnabled, freeProPeriod } = await getMarketingContext();
  if (freeProPeriod) {
    return (
      <div className="mt-3 space-y-1.5">
        <Badge variant="outline" className="rounded-md text-muted-foreground">
          {PRICING.includedBadge}
        </Badge>
        <p className="text-sm text-muted-foreground">{PRICING.freeProPeriod}</p>
      </div>
    );
  }
  return <>{billingEnabled ? null : notOnSale}</>;
}

/**
 * The Pro card's availability line: the free-Pro period's words while it is
 * on (OVE-266), `notOnSale` while billing is off, and nothing once Pro is on
 * sale. Never a way to pay.
 */
export function ProAvailability({ notOnSale }: { notOnSale: ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="h-5 w-64" />}>
      <ProInner notOnSale={notOnSale} />
    </Suspense>
  );
}

/**
 * Renders `off` while billing is off and `on` once it is enabled. With
 * `period`, that wording replaces both during the free-Pro period (OVE-266).
 */
export function WhenBilling({
  off,
  on = null,
  period,
  skeleton = "line",
}: {
  off: ReactNode;
  on?: ReactNode;
  period?: ReactNode;
  skeleton?: "line" | "none";
}) {
  return (
    <Suspense
      fallback={skeleton === "line" ? <Skeleton className="h-5 w-64" /> : null}
    >
      <Inner off={off} on={on} period={period} />
    </Suspense>
  );
}
