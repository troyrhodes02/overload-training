import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { ModeCta } from "@/components/marketing/mode-cta";
import {
  NotOnSaleBadge,
  WhenBilling,
} from "@/components/marketing/availability";
import { publicPageMetadata } from "@/lib/marketing/site";
import {
  FREE_FEATURES,
  PRICING,
  PRICING_FAQ,
  PRO_FEATURES,
  TRIAL,
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
 *
 * The trial (OVE-118) is explained once, above the plans: it starts on its
 * own, you can upgrade during it, and at the end you subscribe or move to Free.
 * Each card carries one short line, and the questions cover the details. Any
 * sentence offering a way to pay has a billing-off wording.
 */

/** A sentence that offers a way to pay, with its billing-off wording. */
function Billed({ on, off }: { on: string; off?: string }) {
  return off ? <WhenBilling on={on} off={off} skeleton="none" /> : <>{on}</>;
}

function TrialExplainer() {
  return (
    <section
      aria-labelledby="trial"
      className="rounded-lg border border-border bg-card p-6"
    >
      <h2 id="trial" className="text-lg font-semibold tracking-tight">
        {TRIAL.title}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {TRIAL.intro}
      </p>
      <ol className="mt-6 grid gap-6 md:grid-cols-3">
        {TRIAL.steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium tabular-nums text-muted-foreground"
            >
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                <Billed
                  on={step.body}
                  off={"billingOff" in step ? step.billingOff : undefined}
                />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

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

      <TrialExplainer />

      <div className="grid gap-6 md:grid-cols-2">
        <PlanCard
          title="Free"
          price={
            <div>
              <p className="text-3xl font-semibold tabular-nums">$0</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Billed
                  on={PRICING.freeCardNote}
                  off={PRICING.freeCardNoteBillingOff}
                />
              </p>
            </div>
          }
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
              <p className="mt-1 text-sm font-medium">{PRICING.proCardNote}</p>
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
          {PRICING_FAQ.map(({ q, a, aBillingOff }) => (
            <div key={q}>
              <dt className="font-medium">{q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                <Billed on={a} off={aBillingOff} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
