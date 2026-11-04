import Link from "next/link";
import { requireAdmin } from "@/lib/data/admin/identity";
import { getBillingOverview } from "@/lib/data/admin/billing";

export const metadata = { title: "Billing · Admin · Overload" };

/**
 * Plans, Billing & Promo Codes — the owner-only billing overview (design
 * Screen 8; spec §9). Aggregate counts and BLIZZY redemptions only: paying
 * subscriptions are counted separately from complimentary, and no training
 * content appears. Read-only — comps are managed on the account page, and
 * Stripe subscription state is never editable here. A non-admin gets not-found
 * via requireAdmin().
 */
export default async function AdminBillingPage() {
  const actor = await requireAdmin();
  const o = await getBillingOverview(actor);

  const counts: [string, number][] = [
    ["Active Pro subscriptions", o.activeSubscriptions],
    ["Trials in progress", o.trials],
    ["Complimentary (non-paying)", o.complimentary],
    ["Canceling at period end", o.cancelingAtPeriodEnd],
    ["Payment problems (grace)", o.paymentProblems],
  ];

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Billing</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {counts.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              {value}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Promotions</h2>
        <p className="mt-1 text-sm">
          {o.promo.code} — 50% off 3 months (monthly)
        </p>
        <p className="text-sm text-muted-foreground">
          Redemptions{" "}
          <span className="tabular-nums text-foreground">
            {o.promo.redeemed} / {o.promo.cap}
          </span>
        </p>
        {o.promo.recent.length > 0 ? (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {o.promo.recent.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between p-3 text-sm"
              >
                <span>@{r.handle}</span>
                <span className="text-muted-foreground tabular-nums">
                  {r.date}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No redemptions yet.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Counts reflect verified Stripe state. Complimentary accounts are
          counted separately and never as paying subscribers.
        </p>
      </div>

      <Link href="/admin" className="text-sm text-muted-foreground">
        ← Admin overview
      </Link>
    </section>
  );
}
