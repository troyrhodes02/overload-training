import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft } from "lucide-react";
import { requireAccount } from "@/lib/data/account";
import { getBillingScreen } from "@/lib/billing/screen";
import { refreshBillingFromStripe } from "@/lib/billing/sync";
import { PlanBilling } from "@/components/billing/plan-billing";
import { CAMPAIGN_COOKIE, parseCampaign } from "@/lib/marketing/campaign";
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
  // A campaign visit in this browser (first-party cookie, validated) can
  // remind the lifter of the code; it never applies a discount (RD-7).
  const campaignHint = parseCampaign(
    (await cookies()).get(CAMPAIGN_COOKIE)?.value,
    new Date(),
  );
  const screen = await getBillingScreen(account, {
    campaignHint,
    inAppShell: await isAppShellRequest(),
  });
  const raw = (await searchParams).status;
  const status =
    raw === "success" ? "success" : raw === "cancelled" ? "cancelled" : null;

  return (
    <section className="space-y-5 pb-20 md:pb-0">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Settings
      </Link>
      <h1 className="text-xl font-semibold">Plan &amp; Billing</h1>
      <PlanBilling screen={screen} status={status} />
    </section>
  );
}
