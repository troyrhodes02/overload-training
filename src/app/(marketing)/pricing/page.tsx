import Link from "next/link";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { ModeCta } from "@/components/marketing/mode-cta";
import {
  NotOnSaleBadge,
  WhenBilling,
} from "@/components/marketing/availability";
import { publicPageMetadata } from "@/lib/marketing/site";
import {
  DISCOUNT_FAQ,
  FREE_FEATURES,
  PRICING,
  PRICING_FAQ,
  PRO_FEATURES,
} from "@/lib/marketing/copy";
import { cn } from "@/lib/utils";

export const metadata = publicPageMetadata({
  path: "/pricing",
  title: "Pricing · Overload",
  description: `Free: plans, logging, history, goals, and export, with no ads. Pro: the progress, hold, and deload calls and the trends, ${PRICING.monthly} a month or ${PRICING.annual} a year.`,
});

/**
 * Pricing (design doc Screen 2; spec RD-5, RD-6). Free first. Pro's prices
 * come from the billing display constants; while billing is off the Pro card
 * says "Not on sale yet" and offers no way to pay. With billing on, the Pro
 * action routes to the existing Plan & Billing flow — never to Checkout from
 * here.
 */

function PlanCard({
  title,
  price,
  pro,
  children,
}: {
  title: string;
  price: ReactNode;
  pro?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card p-6",
        pro ? "border-primary/40" : "border-border",
      )}
    >
      <h2 className="font-medium">{title}</h2>
      <div className="mt-3">{price}</div>
      <div className="mt-6 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2.5 text-sm">
      {items.map((f) => (
        <li key={f} className="flex gap-2.5">
          <Check
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          {f}
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-16 md:px-6 md:py-24">
      <div className="max-w-xl space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">
          {PRICING.title}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
          {PRICING.intro}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <PlanCard
          title="Free"
          price={<p className="text-3xl font-semibold tabular-nums">$0</p>}
        >
          <FeatureList items={FREE_FEATURES} />
          <div className="mt-auto pt-8">
            <ModeCta placement="free-card" />
          </div>
        </PlanCard>

        <PlanCard
          pro
          title="Pro"
          price={
            <div>
              <p className="text-3xl font-semibold tabular-nums">
                {PRICING.monthly}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  / month
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                or {PRICING.annual} / year (about {PRICING.annualPerMonth} a
                month)
              </p>
              <WhenBilling
                off={
                  <div className="mt-3 space-y-1.5">
                    <NotOnSaleBadge />
                    <p className="text-sm text-muted-foreground">
                      {PRICING.notOnSale}
                    </p>
                  </div>
                }
              />
            </div>
          }
        >
          <FeatureList items={PRO_FEATURES} />
          <p className="mt-6 text-sm text-muted-foreground">{PRICING.trial}</p>
          <div className="mt-auto pt-8">
            <ModeCta placement="pro-card" />
          </div>
        </PlanCard>
      </div>

      <section
        aria-labelledby="questions"
        className="space-y-6 border-t border-border pt-10"
      >
        <h2 id="questions" className="text-2xl font-semibold tracking-tight">
          Questions
        </h2>
        <dl className="grid gap-6 md:grid-cols-2">
          {PRICING_FAQ.slice(0, 2).map(({ q, a }) => (
            <div key={q}>
              <dt className="font-medium">{q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {a}
              </dd>
            </div>
          ))}
          <div>
            <dt className="font-medium">{DISCOUNT_FAQ.q}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {DISCOUNT_FAQ.a}{" "}
              <Link
                href="/blizzy"
                className="text-primary underline-offset-4 hover:underline"
              >
                BLIZZY offer details
              </Link>
              . <WhenBilling skeleton="none" off={DISCOUNT_FAQ.offTail} />
            </dd>
          </div>
          {PRICING_FAQ.slice(2).map(({ q, a }) => (
            <div key={q}>
              <dt className="font-medium">{q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {a}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
