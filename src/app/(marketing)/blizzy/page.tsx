import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeCta } from "@/components/marketing/mode-cta";
import { CopyCode } from "@/components/marketing/copy-code";
import {
  NotOnSaleBadge,
  WhenBilling,
} from "@/components/marketing/availability";
import { getMarketingContext } from "@/lib/marketing/context";
import { resolveCta } from "@/lib/marketing/cta";
import { publicPageMetadata } from "@/lib/marketing/site";
import { BLIZZY_PAGE } from "@/lib/marketing/copy";
import { BLIZZY } from "@/lib/billing/config";
import { creatorDisclosure } from "@/lib/marketing/disclosure";
import { OWNER_FACTS } from "@/lib/legal/facts";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = publicPageMetadata({
  path: "/blizzy",
  title: "The BLIZZY offer · Overload",
  description:
    "50% off the first three monthly bills of Overload Pro for first-time subscribers, up to 200 redemptions. Entered at checkout.",
});

/**
 * The BLIZZY page (design doc Screen 3; spec RD-7, RD-8, RD-13). It states the
 * offer and every condition, says whether it can be used today, and offers
 * the code to copy. It never applies, validates, or reserves a discount and
 * shows no redemption counter: Stripe Checkout and the existing billing
 * checks decide. Visiting it sets the first-party campaign cookie (proxy).
 */

async function OfferAction() {
  const ctx = await getMarketingContext();
  const cta = resolveCta(ctx);
  // A signed-in lifter with billing on goes to the existing Plan & Billing
  // screen (email verification + hosted Checkout live there, RD-6).
  if (ctx.signedIn && cta.pro) {
    return (
      <Button asChild className="h-11 w-full px-5 sm:w-auto">
        <Link href={cta.pro.href}>{cta.pro.label}</Link>
      </Button>
    );
  }
  return <ModeCta placement="hero" />;
}

export default function BlizzyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-16 md:py-24">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          {BLIZZY_PAGE.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          {BLIZZY_PAGE.title}
        </h1>
      </div>

      <div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Code</p>
              <p className="select-all font-mono text-lg tracking-wide">
                {BLIZZY.code}
              </p>
            </div>
            <CopyCode code={BLIZZY.code} />
          </div>
          <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            {BLIZZY_PAGE.conditions.map((c) => (
              <li key={c} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
                />
                {c}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {creatorDisclosure(OWNER_FACTS.creatorDisclosure)}
        </p>
      </div>

      <div className="space-y-4">
        <WhenBilling
          off={
            <div className="space-y-1.5">
              <NotOnSaleBadge />
              <p className="text-sm text-muted-foreground">
                {BLIZZY_PAGE.availableOff}
              </p>
            </div>
          }
          on={
            <p className="text-sm text-muted-foreground">
              {BLIZZY_PAGE.availableOn}
            </p>
          }
        />
        <Suspense fallback={<Skeleton className="h-11 w-full sm:w-48" />}>
          <OfferAction />
        </Suspense>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {BLIZZY_PAGE.trialFit}
      </p>

      <section
        aria-labelledby="about"
        className="space-y-3 border-t border-border pt-8"
      >
        <h2 id="about" className="text-lg font-semibold">
          {BLIZZY_PAGE.aboutTitle}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {BLIZZY_PAGE.about}
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          How it works <ArrowRight aria-hidden className="size-4" />
        </Link>
      </section>
    </div>
  );
}
