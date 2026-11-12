import { tourAnchor } from "@/lib/tour/steps";
import { requireAccount } from "@/lib/data/account";
import { getBillingScreen } from "@/lib/billing/screen";
import { refreshBillingFromStripe } from "@/lib/billing/sync";
import { PlanBilling } from "@/components/billing/plan-billing";
import { isAppShellRequest } from "@/lib/platform/request";

export const metadata = { title: "Plan & Billing · Overload" };

/**
 * Plans, Billing & Promo Codes — the Plan & Billing leaf (design Screen 1).
 * Reads the resolved billing state server-side and hands it to the interactive
 * island. The `?status` return param only tints the panel (success/cancelled);
 * it is never authoritative for Pro access — the resolved entitlement is.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireAccount();
  // Converge the mirror on Stripe's current truth first, so a missed or late
  // webhook can't leave this screen asserting a stale state (e.g. "renews"
  // after a scheduled cancellation). Best-effort — never breaks the page.
  await refreshBillingFromStripe(account);
  const screen = await getBillingScreen(account, {
    inAppShell: await isAppShellRequest(),
  });
  const raw = (await searchParams).status;
  const status =
    raw === "success" ? "success" : raw === "cancelled" ? "cancelled" : null;

  return (
    <section className="space-y-5 pb-20 md:pb-0">
      {/* A navigation destination of its own since OVE-119: no "‹ Settings". */}
      <h1 className="text-xl font-semibold" {...tourAnchor("page-billing")}>
        Plan &amp; Billing
      </h1>
      <PlanBilling screen={screen} status={status} />
    </section>
  );
}
