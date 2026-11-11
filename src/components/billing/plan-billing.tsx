"use client";

import * as React from "react";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CreditCard, ExternalLink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyCode } from "@/components/marketing/copy-code";
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

type Busy = "checkout" | "manage" | "verify" | null;
type Pick = "month" | "year";

/**
 * The plain-words disclosure shown before leaving for Stripe (OVE-112). A
 * trial account is told plainly that subscribing now starts paid billing
 * today rather than at the end of the trial. Exported for tests.
 */
export function checkoutDisclosure(
  pick: Pick,
  prices: { monthly: string; annual: string },
  trial: boolean,
): { summary: string; detail: string; leave: string } {
  const price = pick === "year" ? prices.annual : prices.monthly;
  const per = pick === "year" ? "year" : "month";
  return {
    summary: `Pro ${pick === "year" ? "Annual" : "Monthly"} — ${price}/${per}.`,
    detail: trial
      ? `Subscribing now starts paid billing today: ${price} is charged when you complete checkout, then every ${per}. The rest of your free trial isn't added on.`
      : `${price} is charged when you complete checkout, then every ${per}. Cancel anytime.`,
    leave: trial
      ? "Checkout is on Stripe. Leaving it without paying changes nothing, and your trial continues."
      : "Checkout is on Stripe. Leaving it without paying changes nothing.",
  };
}

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
  const [pick, setPick] = useState<Pick | null>(null);
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
    !screen.inAppShell &&
    !confirming &&
    (screen.displayState === "free" || screen.displayState === "trial");
  const trial = screen.displayState === "trial";

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

          {showSubscribe && screen.promoReminder ? (
            <div className="mt-3 flex flex-col gap-2 rounded-md bg-primary/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p>
                Have the {screen.promoReminder} code? Enter{" "}
                <span className="font-mono">{screen.promoReminder}</span> at
                checkout. Stripe shows whether it applies.
              </p>
              <CopyCode code={screen.promoReminder} size="xs" />
            </div>
          ) : null}

          {showSubscribe && screen.emailVerified ? (
            <div
              id="subscribe"
              className="mt-4 space-y-2 border-t border-border pt-4"
            >
              <p className="text-sm font-medium">Subscribe to Pro</p>
              {pick === null ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="h-11 flex-1 sm:h-9"
                    onClick={() => setPick("month")}
                  >
                    Monthly — {screen.prices.monthly}/mo
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 flex-1 sm:h-9"
                    onClick={() => setPick("year")}
                  >
                    Annual — {screen.prices.annual}/yr
                  </Button>
                </div>
              ) : (
                <CheckoutConfirm
                  disclosure={checkoutDisclosure(pick, screen.prices, trial)}
                  busy={busy === "checkout"}
                  disabled={busy !== null}
                  onBack={() => {
                    setPick(null);
                    setError(null);
                  }}
                  onContinue={() =>
                    go("checkout", () => createCheckoutSessionAction(pick))
                  }
                />
              )}
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

          {screen.inAppShell ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Your plan is shown here. Plan changes aren&apos;t available in the
              app.
            </p>
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

function CheckoutConfirm({
  disclosure,
  busy,
  disabled,
  onBack,
  onContinue,
}: {
  disclosure: { summary: string; detail: string; leave: string };
  busy: boolean;
  disabled: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-sm">
        <span className="font-medium tabular-nums">{disclosure.summary}</span>{" "}
        {disclosure.detail}
      </p>
      <p className="text-xs text-muted-foreground">{disclosure.leave}</p>
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button
          className="h-11 sm:h-9"
          disabled={disabled}
          onClick={onContinue}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Starting checkout…" : "Continue to checkout"}
        </Button>
        <Button
          variant="ghost"
          className="h-11 sm:h-9"
          disabled={disabled}
          onClick={onBack}
        >
          Back
        </Button>
      </div>
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
