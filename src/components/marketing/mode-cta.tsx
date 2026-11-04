import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMarketingContext } from "@/lib/marketing/context";
import { resolveCta, type ResolvedCta } from "@/lib/marketing/cta";
import { cn } from "@/lib/utils";

/**
 * The server-resolved call to action (design doc §6.9; spec §6). Every public
 * button comes from resolveCta over the request's real signup mode, billing
 * switch, and session — never a hard-coded launch state. The parts stream
 * behind button-sized skeletons so nothing shifts while the server decides.
 */

export type CtaPlacement = "hero" | "header" | "free-card" | "pro-card";

async function resolved(): Promise<ResolvedCta> {
  return resolveCta(await getMarketingContext());
}

async function ModeCtaInner({ placement }: { placement: CtaPlacement }) {
  const cta = await resolved();

  if (placement === "header") {
    return (
      <>
        {cta.secondary ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={cta.secondary.href}>{cta.secondary.label}</Link>
          </Button>
        ) : null}
        <Button asChild size="sm">
          <Link href={cta.primary.href}>{cta.primary.label}</Link>
        </Button>
      </>
    );
  }

  if (placement === "pro-card") {
    // Billing off: no Pro action at all — the card's "Not on sale yet" note
    // carries the availability (RD-5).
    return cta.pro ? (
      <Button asChild className="h-11 w-full sm:w-auto">
        <Link href={cta.pro.href}>{cta.pro.label}</Link>
      </Button>
    ) : null;
  }

  return (
    <div className="space-y-3">
      <Button
        asChild
        className={cn("h-11 px-5", placement === "hero" && "w-full sm:w-auto")}
      >
        <Link href={cta.primary.href}>
          {cta.primary.label}
          {placement === "hero" ? <ArrowRight aria-hidden /> : null}
        </Link>
      </Button>
      {cta.note ? (
        <p className="text-sm text-muted-foreground">
          {cta.note}
          {cta.closed ? (
            <>
              {" "}
              <Link
                href="/support"
                className="text-primary underline-offset-4 hover:underline"
              >
                Contact support
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function CtaSkeleton({ placement }: { placement: CtaPlacement }) {
  if (placement === "header") return <Skeleton className="h-9 w-28" />;
  if (placement === "pro-card")
    return <Skeleton className="h-11 w-full sm:w-56" />;
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-11 w-full sm:w-48" />
      <Skeleton className="h-4 w-56" />
    </div>
  );
}

export function ModeCta({ placement }: { placement: CtaPlacement }) {
  return (
    <Suspense fallback={<CtaSkeleton placement={placement} />}>
      <ModeCtaInner placement={placement} />
    </Suspense>
  );
}
