"use client";

import * as React from "react";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CreditCard, ExternalLink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCheckoutSessionAction,
  createPortalSessionAction,
} from "@/app/(app)/settings/billing/actions";
import { sendVerificationEmailAction } from "@/app/(app)/settings/actions";
import type { BillingScreenDto } from "@/lib/billing/screen";
import { isConfirmingCheckout } from "@/lib/billing/pending";

/**
 * Plans, Billing & Promo Codes — the Plan & Billing screen (design Screen 1/2/5).
 * One interactive island: the resolved state, subscribe (hosted Checkout) or
 * manage (Customer Portal), the verify-before-checkout step, and the return
 * states. The success return shows a calm "finishing up" line and never asserts
 * Pro from the query param — the server's resolved state is the only truth.
 */

const FREE = [
  "Build splits, mesocycles & sessions",
  "Log workouts, RIR, bodyweight & cardio",
  "Full logged history & corrections",
  "Goals & their progress",
  "Export all your data",
];
const PRO = [
  "Everything in Free",
  "Progress / hold / deload calls + why",
  "e1RM trends & stall detection",
  "RIR used in recommendations",
  "Exercise history & PR intelligence",
];

type Busy = "monthly" | "annual" | "manage" | "verify" | null;

export function PlanBilling({
  screen,
  status,
}: {
  screen: BillingScreenDto;
  status: "success" | "cancelled" | null;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifySent, setVerifySent] = useState(false);
  const router = useRouter();

  // The "finishing up" indicator shows only while a checkout-success return is
  // still waiting for the webhook to record the subscription; it clears the
  // moment the resolved state reflects it (and never shows on an ordinary load).
  const confirming = isConfirmingCheckout(status, screen.displayState);

  // While genuinely pending, re-read the server state a few times so the
  // indicator clears on its own when the webhook lands — bounded, so a delayed
  // payment doesn't poll forever (it just stays on the message until reload).
  React.useEffect(() => {
    if (!confirming) return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      router.refresh();
      if (tries >= 8) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [confirming, router]);

  async function go(
    key: Busy,
    run: () => Promise<
      | { ok: true; data: { url: string } }
      | { ok: false; error: { message: string } }
    >,
  ) {
    setBusy(key);
    setError(null);
    const result = await run();
    if (result.ok) {
      window.location.href = result.data.url;
    } else {
      setError(result.error.message);
      setBusy(null);
    }
  }

  const showSubscribe = screen.canSubscribe && !confirming;
  // Billing disabled on this deployment (kill switch) and the lifter is on a
  // plan that could otherwise subscribe: show a plain note instead of buttons.
  const showUnavailable =
    !screen.billingEnabled &&
    !confirming &&
    (screen.displayState === "free" || screen.displayState === "trial");

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Your plan
        </p>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            {screen.problem ? (
              <TriangleAlert
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
            ) : null}
            <span className="text-base font-medium">{screen.label}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {screen.explanation}
          </p>

          {confirming ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Finishing up — confirming your subscription. We&apos;ll update
              your plan as soon as payment is confirmed.
            </div>
          ) : null}
          {status === "cancelled" ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Checkout cancelled. Your plan hasn&apos;t changed.
            </p>
          ) : null}
          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{error}</span>
            </div>
          ) : null}

          {showUnavailable ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Pro subscriptions aren&apos;t available yet. Everything you log
              stays free, and we&apos;ll let you know when Pro opens.
            </p>
          ) : null}

          {showSubscribe && screen.emailVerified ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1"
                disabled={busy !== null}
                onClick={() =>
                  go("monthly", () => createCheckoutSessionAction("month"))
                }
              >
                {busy === "monthly" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {busy === "monthly"
                  ? "Starting checkout…"
                  : `Monthly — ${screen.prices.monthly}/mo`}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy !== null}
                onClick={() =>
                  go("annual", () => createCheckoutSessionAction("year"))
                }
              >
                {busy === "annual" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {busy === "annual"
                  ? "Starting checkout…"
                  : `Annual — ${screen.prices.annual}/yr`}
              </Button>
            </div>
          ) : null}

          {showSubscribe && !screen.emailVerified ? (
            <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-sm font-medium">
                Verify your email to subscribe
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Verifying protects your subscription and receipts. It isn&apos;t
                needed to use Free.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy("verify");
                    setVerifySent(false);
                    setError(null);
                    startTransition(async () => {
                      const r = await sendVerificationEmailAction();
                      if (r.ok) setVerifySent(true);
                      else setError(r.error.message);
                      setBusy(null);
                    });
                  }}
                >
                  {busy === "verify"
                    ? "Sending…"
                    : "Send the verification email"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.location.reload()}
                >
                  Already verified? Refresh
                </Button>
              </div>
              {verifySent ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Check your inbox for the link, then choose Refresh.
                </p>
              ) : null}
            </div>
          ) : null}

          {screen.canManage ? (
            <div className="mt-3">
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => go("manage", () => createPortalSessionAction())}
              >
                {busy === "manage" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                Manage billing
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </div>
          ) : null}

          {screen.displayState === "comp" ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Complimentary access is managed by Overload — there&apos;s nothing
              to pay or cancel.
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Compare plans
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <PlanCard
            name="Free"
            price="$0"
            features={FREE}
            current={screen.displayState === "free"}
          />
          <PlanCard
            name="Pro"
            price={`${screen.prices.monthly}/mo`}
            features={PRO}
            current={screen.displayState !== "free"}
            accent
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Annual is {screen.prices.annual}/yr (about two months free). Billed
          through Stripe. Renews automatically. Cancel anytime in Manage
          billing.
        </p>
      </section>
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  current,
  accent,
}: {
  name: string;
  price: string;
  features: string[];
  current: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-card p-4 ${
        accent ? "bg-muted/20" : ""
      } ${current ? "ring-1 ring-primary/40" : ""}`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-medium">{name}</h3>
        {current ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Current
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {price}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        {features.map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>
    </div>
  );
}
