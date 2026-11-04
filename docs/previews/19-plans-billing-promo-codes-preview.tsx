/* eslint-disable */
// @ts-nocheck
/**
 * Plans, Billing & Promo Codes — UI Design Preview (implementation contract)
 * ==========================================================================
 * Pitch 19 (roadmap 20) · generated from
 * docs/design/19-plans-billing-promo-codes-design-doc.md v1.0
 *
 * THIS IS A RENDERING OF THE DESIGN, NOT PRODUCT CODE. Self-contained,
 * mock-data-only, used as the visual contract the spec and implementation
 * tickets are held to. It never touches Prisma, Supabase, Stripe, a server
 * action, or the network. Excluded from typecheck, lint, format, and the build;
 * never imported by the app. The real UI is built with shadcn/ui against
 * src/app/globals.css; where this preview and the theme disagree, the theme wins.
 *
 * The chrome above the frame (screen, state, width, appearance) is preview
 * chrome only — not product UI.
 *
 * Commitments every frame respects (from the design doc):
 *   • Your data is never behind the wall. Capture, history, goals, and export
 *     carry no lock on any plan. Only the interpretation surfaces ever show a
 *     Pro state — and only as ONE quiet, dismissible line.
 *   • Access state is read, never asserted by the browser. A checkout "success"
 *     return shows a calm "finishing up" state until the verified entitlement
 *     arrives; the query param never flips the UI to Pro on its own.
 *   • Paid and complimentary are different words. A comped lifter is never shown
 *     a renewal price, a card, or a subscriber label; the owner's admin view
 *     keeps the same distinction and never counts a comp as revenue.
 *   • Disclose the whole price. A promotion shows its price, its duration, the
 *     regular recurring price after, that it renews, and how to cancel.
 *   • No countdowns, banners, fake scarcity, or color alerts. Billing never
 *     reuses the progress/deload tokens. A payment problem is a muted line, not
 *     a red takeover. Card fields live only on Stripe's hosted page.
 */
import * as React from "react";
import {
  Loader2,
  X,
  Check,
  TriangleAlert,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Gift,
  ArrowUpRight,
} from "lucide-react";

/* ───────────────────────────── mock data ───────────────────────────── */

const OWN_EMAIL = "will@example.com";
const PRICES = { monthly: "$4.99", annual: "$39.99" };
const BLIZZY = {
  code: "BLIZZY",
  terms: "50% off for 3 months, then $4.99/month",
  cap: 200,
  redeemed: 41,
};

const FREE_FEATURES = [
  "Build splits, mesocycles & sessions",
  "Log workouts, RIR, bodyweight & cardio",
  "Full logged history & corrections",
  "Goals & their progress",
  "Export all your data",
];
const PRO_FEATURES = [
  "Everything in Free",
  "Progress / hold / deload calls + why",
  "e1RM trends & stall detection",
  "RIR used in recommendations",
  "Exercise history & PR intelligence",
];

// Resolved entitlement states (read-only; the server decides these).
const PLAN_STATES = {
  trial: {
    key: "trial",
    label: "Pro — trial · 9 days left",
    short: "Pro — trial · 9 days left",
    explanation:
      "Full Pro through Nov 10. After the trial you move to Free, with nothing lost.",
    canSubscribe: true,
    canManage: false,
    current: "pro",
  },
  free: {
    key: "free",
    label: "Free",
    short: "Free",
    explanation:
      "You have the full training tracker. Pro adds Overload's reading of your training.",
    canSubscribe: true,
    canManage: false,
    current: "free",
  },
  paidMonthly: {
    key: "paidMonthly",
    label: "Pro — Monthly",
    short: "Pro — Monthly",
    explanation: "Renews Dec 1 at $4.99/month. Manage or cancel anytime.",
    canSubscribe: false,
    canManage: true,
    current: "pro",
  },
  paidAnnual: {
    key: "paidAnnual",
    label: "Pro — Annual",
    short: "Pro — Annual",
    explanation: "Renews Nov 1, 2027 at $39.99/year. Manage or cancel anytime.",
    canSubscribe: false,
    canManage: true,
    current: "pro",
  },
  comp: {
    key: "comp",
    label: "Pro — complimentary",
    short: "Pro — complimentary",
    explanation:
      "You have complimentary Pro as a founding member. No payment, no renewal.",
    canSubscribe: false,
    canManage: false,
    current: "pro",
  },
  canceling: {
    key: "canceling",
    label: "Pro — ends Dec 1",
    short: "Pro — ends Dec 1",
    explanation:
      "Your subscription is set to cancel. You keep Pro through Dec 1, then move to Free.",
    canSubscribe: false,
    canManage: true,
    current: "pro",
  },
  grace: {
    key: "grace",
    label: "Payment problem",
    short: "Payment problem",
    explanation:
      "We couldn't take your last payment. Update it by Dec 3 to keep Pro. Nothing is lost.",
    canSubscribe: false,
    canManage: true,
    current: "pro",
    problem: true,
  },
};

/* ───────────────────────── shadcn-shaped primitives ─────────────────────── */

const cx = (...c) => c.filter(Boolean).join(" ");

function Button({ variant = "default", size = "default", className, children, disabled, ...p }) {
  const v = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-border bg-background hover:bg-muted",
    ghost: "hover:bg-muted text-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    secondary: "bg-muted text-foreground hover:bg-muted/80",
  }[variant];
  const s = {
    default: "h-10 px-4 text-sm",
    sm: "h-9 px-3 text-sm",
    lg: "h-11 px-5 text-sm",
    icon: "h-11 w-11",
  }[size];
  return (
    <button
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        v,
        s,
        className,
      )}
      {...p}
    >
      {children}
    </button>
  );
}

function Card({ className, children }) {
  return <div className={cx("rounded-lg border border-border bg-card", className)}>{children}</div>;
}
function CardHeader({ className, children }) {
  return <div className={cx("p-4 pb-2", className)}>{children}</div>;
}
function CardTitle({ className, children }) {
  return <h3 className={cx("text-base font-medium text-foreground", className)}>{children}</h3>;
}
function CardDesc({ className, children }) {
  return <p className={cx("text-sm text-muted-foreground mt-1", className)}>{children}</p>;
}
function CardContent({ className, children }) {
  return <div className={cx("p-4 pt-2", className)}>{children}</div>;
}

function Badge({ variant = "secondary", className, children }) {
  const v = {
    secondary: "bg-muted text-muted-foreground",
    outline: "border border-border text-muted-foreground",
    accent: "bg-primary/10 text-primary",
  }[variant];
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", v, className)}>
      {children}
    </span>
  );
}

function Skeleton({ className }) {
  return <div className={cx("animate-pulse rounded-md bg-muted", className)} />;
}

function Alert({ className, children }) {
  return (
    <div className={cx("rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground flex gap-2", className)}>
      {children}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
function Input(p) {
  return (
    <input
      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...p}
    />
  );
}
function Select({ children, ...p }) {
  return (
    <select
      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...p}
    >
      {children}
    </select>
  );
}

function Dialog({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-xl border border-border bg-card shadow-lg sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ───────────────────────── product components ─────────────────────── */

// EntitlementState — single presentational source of state copy, reused by the
// lifter billing panel, the Settings row, and the admin account page.
function StateLine({ state }) {
  return (
    <div className="flex items-center gap-2">
      {state.problem && <TriangleAlert className="h-4 w-4 text-muted-foreground" aria-hidden />}
      <span className="text-base font-medium text-foreground">{state.label}</span>
    </div>
  );
}

function SubscribeButtons({ busy }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button className="flex-1" disabled={busy === "monthly"}>
        {busy === "monthly" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy === "monthly" ? "Starting checkout…" : `Monthly — ${PRICES.monthly}/mo`}
      </Button>
      <Button variant="outline" className="flex-1" disabled={busy === "annual"}>
        {busy === "annual" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy === "annual" ? "Starting checkout…" : `Annual — ${PRICES.annual}/yr`}
      </Button>
    </div>
  );
}

function PlanComparison({ current }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Card className={cx(current === "free" && "ring-1 ring-primary/40")}>
        <CardHeader>
          <div className="flex items-baseline justify-between">
            <CardTitle>Free</CardTitle>
            {current === "free" && <Badge variant="secondary">Current</Badge>}
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">$0</p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                {f}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className={cx("bg-muted/20", current === "pro" && "ring-1 ring-primary/40")}>
        <CardHeader>
          <div className="flex items-baseline justify-between">
            <CardTitle className="flex items-center gap-1.5">
              Pro <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            </CardTitle>
            {current === "pro" && <Badge variant="accent">Current</Badge>}
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {PRICES.monthly}
            <span className="text-sm font-normal text-muted-foreground">/mo</span>
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// Screen 1 — Plan & Billing (Settings leaf)
function PlanBillingScreen({ stateKey, variant }) {
  const state = PLAN_STATES[stateKey] ?? PLAN_STATES.trial;
  const [busy, setBusy] = React.useState(null);

  return (
    <Screen title="Plan & Billing" back="Settings">
      {variant === "loading" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your plan</p>
            <Card>
              <CardHeader>
                <StateLine state={state} />
                <CardDesc>{state.explanation}</CardDesc>
              </CardHeader>
              <CardContent className="space-y-3">
                {variant === "success" && (
                  <div
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finishing up — confirming your subscription. We'll update your plan as soon as
                    payment is confirmed.
                  </div>
                )}
                {variant === "cancelled" && (
                  <p className="text-sm text-muted-foreground">Checkout cancelled. Your plan hasn't changed.</p>
                )}
                {variant === "error" && (
                  <Alert>
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                      Couldn't start checkout. Please try again.
                      <div className="mt-2">
                        <Button size="sm" variant="outline">Retry</Button>
                      </div>
                    </div>
                  </Alert>
                )}
                {variant === "verify" ? (
                  <VerifyBeforeCheckout />
                ) : (
                  <>
                    {state.canSubscribe && variant !== "success" && (
                      <SubscribeButtons busy={busy} />
                    )}
                    {state.canManage && (
                      <Button variant="outline" className="w-full sm:w-auto">
                        <CreditCard className="h-4 w-4" />
                        Manage billing
                        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                      </Button>
                    )}
                    {state.key === "comp" && (
                      <p className="text-xs text-muted-foreground">
                        Complimentary access is managed by Overload — there's nothing to pay or cancel.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Compare plans</p>
            <PlanComparison current={state.current} />
            <p className="text-xs text-muted-foreground">
              Annual is {PRICES.annual}/yr (about two months free). Billed through Stripe. Renews
              automatically. Cancel anytime in Manage billing.
            </p>
          </section>
        </div>
      )}
    </Screen>
  );
}

// Screen 2 — Verify email before first checkout (inline step)
function VerifyBeforeCheckout() {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Verify your email to subscribe</p>
          <p className="text-sm text-muted-foreground">
            We sent a link to {OWN_EMAIL}. Verifying protects your subscription and receipts. It
            isn't needed to use Free.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline">Resend verification email</Button>
            <Button size="sm" variant="ghost">Already verified? Refresh</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Screen 4 — the quiet upgrade note, shown in place of a withheld Pro result.
function UpgradeNote({ feature = "Progression insights" }) {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;
  return (
    <div className="mt-3 flex items-start justify-between gap-3 border-t border-border pt-3">
      <p className="text-sm text-muted-foreground">
        {feature} are part of Pro.{" "}
        <a className="text-primary underline-offset-2 hover:underline" href="#">
          See the call and why → Plan &amp; Billing
        </a>
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 -mt-2 -mr-1"
        aria-label={`Dismiss — ${feature} are part of Pro`}
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Screen 4 context — a Free lifter's exercise card with the note in the
// recommendation area. The set rows, swap, and reps/weight stay fully usable.
function FreeExerciseCard() {
  return (
    <Screen title="Push Day 1" meta="2 / 5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Barbell Bench Press</CardTitle>
          </div>
          <CardDesc>Downtown Gym · 3 × 6–8</CardDesc>
        </CardHeader>
        <CardContent className="space-y-2 tabular-nums">
          {[
            [185, 8],
            [185, 8],
            [185, null],
          ].map(([w, r], i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="w-12 text-muted-foreground">Set {i + 1}</span>
              <span className="rounded-md border border-border px-3 py-2">{w} lbs</span>
              <span className="rounded-md border border-border px-3 py-2">
                {r ?? <span className="text-muted-foreground">reps</span>}
              </span>
            </div>
          ))}
          <UpgradeNote feature="Progression insights" />
        </CardContent>
      </Card>
      <div className="pt-4">
        <Button className="w-full">Next: Incline Dumbbell Press</Button>
      </div>
    </Screen>
  );
}

// Screen 5 — Settings index with the trial sub-label row.
function SettingsIndex({ stateKey = "trial" }) {
  const state = PLAN_STATES[stateKey];
  const rows = [
    ["Appearance", "System"],
    ["Name", "William Rhodes"],
    ["Plan & Billing", state.short, true],
    ["Gyms", "3 gyms"],
    ["Export your data", ""],
    ["What's New", ""],
  ];
  return (
    <Screen title="Settings">
      <Card>
        <ul className="divide-y divide-border">
          {rows.map(([label, value, accent], i) => (
            <li key={i} className="flex items-center justify-between p-4">
              <span className="text-sm text-foreground">{label}</span>
              <span className="flex items-center gap-2">
                <span className={cx("text-xs tabular-nums", accent ? "text-muted-foreground" : "text-muted-foreground")}>
                  {value}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Screen>
  );
}

/* ─────────────────────────── admin surfaces ─────────────────────────── */

// Screen 6 — admin account page entitlement & billing section.
function AdminEntitlementSection({ kind }) {
  const [dialog, setDialog] = React.useState(null);
  const configs = {
    comp: {
      effective: "Pro",
      source: (
        <>
          Complimentary (founding member)
          <div className="text-muted-foreground">granted by owner · no end date</div>
        </>
      ),
      stripe: "none",
      action: "revoke",
    },
    paying: {
      effective: "Pro",
      source: "Subscription",
      stripe: (
        <>
          active · Monthly · renews 2026-12-01
          <div className="text-muted-foreground">promo: BLIZZY (2 of 3 months)</div>
        </>
      ),
      action: "grant",
    },
    free: {
      effective: "Free",
      source: "Trial ended 2026-10-20",
      stripe: "none",
      action: "grant",
    },
  };
  const c = configs[kind] ?? configs.comp;

  return (
    <Screen title="Account" back="Accounts" admin>
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <span className="text-base font-medium text-foreground">William Rhodes</span>
              <span className="text-sm text-muted-foreground">@will</span>
              <Badge variant="secondary">Active</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{OWN_EMAIL}</p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Joined 2026-08-01 · Last seen 2026-10-31
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Plan &amp; entitlement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Fact label="Effective" value={<span className="font-medium text-foreground">{c.effective}</span>} />
            <Fact
              label="Source"
              value={
                <span>
                  {c.action === "revoke" ? <Badge variant="accent" className="mr-2">Complimentary</Badge> : null}
                  {c.source}
                </span>
              }
            />
            <Fact
              label="Subscription (Stripe, read-only)"
              value={<span className="text-muted-foreground">{c.stripe}</span>}
            />
            <div className="pt-1">
              {c.action === "revoke" ? (
                <Button variant="outline" size="sm" onClick={() => setDialog("revoke")}>
                  Revoke complimentary access
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setDialog("grant")}>
                  <Gift className="h-4 w-4" />
                  Grant complimentary access
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Stripe facts are a read-only mirror. Only complimentary access is editable here, and it
              never touches Stripe. No plan, session, set, goal, gym, or cardio is shown.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Access</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="sm">Suspend account</Button>
            <Button variant="outline" size="sm">Send password-reset email</Button>
          </CardContent>
        </Card>
      </div>

      {dialog === "grant" && <GrantCompDialog onClose={() => setDialog(null)} />}
      {dialog === "revoke" && <RevokeCompDialog onClose={() => setDialog(null)} />}
    </Screen>
  );
}

function Fact({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="sm:text-right">{value}</span>
    </div>
  );
}

// Screen 7a — Grant complimentary access.
function GrantCompDialog({ onClose }) {
  const [reason, setReason] = React.useState("founding_member");
  return (
    <Dialog title="Grant complimentary Pro" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">William Rhodes · {OWN_EMAIL}</p>
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="friend">Friend</option>
            <option value="creator">Creator</option>
            <option value="tester">Tester</option>
            <option value="founding_member">Founding member</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        {reason === "other" && (
          <Field label="Note" hint="Required when the reason is Other.">
            <Input placeholder="Short note" />
          </Field>
        )}
        <Field label="Ends on" hint="Optional. Leave blank for open-ended access.">
          <Input type="date" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onClose}>Grant access</Button>
        </div>
      </div>
    </Dialog>
  );
}

// Screen 7b — Revoke complimentary access.
function RevokeCompDialog({ onClose }) {
  return (
    <Dialog title="Revoke complimentary Pro" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This removes complimentary Pro from <span className="text-foreground">William Rhodes</span>.
          Their access will be recalculated from any other valid source (trial or subscription). No
          training data is affected.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={onClose}>Revoke access</Button>
        </div>
      </div>
    </Dialog>
  );
}

// Screen 8 — admin billing overview.
function AdminBillingOverview({ variant }) {
  const counts = [
    ["Active Pro subscriptions", 12],
    ["Trials in progress", 37],
    ["Complimentary (non-paying)", 9],
    ["Canceling at period end", 2],
    ["Payment problems (grace)", 1],
  ];
  const redemptions = [
    ["@will", "2026-10-30"],
    ["@sam", "2026-10-29"],
    ["@maya", "2026-10-28"],
  ];
  return (
    <Screen title="Billing" admin>
      {variant === "empty" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {counts.map(([label]) => (
                  <Metric key={label} label={label} value={0} />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Promotions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No redemptions yet.</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {counts.map(([label, value]) => (
                  <Metric key={label} label={label} value={value} />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Promotions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {BLIZZY.code} — 50% off 3 months (monthly)
                </p>
                <p className="text-sm text-muted-foreground">
                  Redemptions{" "}
                  <span className="tabular-nums text-foreground">
                    {BLIZZY.redeemed} / {BLIZZY.cap}
                  </span>
                </p>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border">
                {redemptions.map(([who, date]) => (
                  <li key={who} className="flex items-center justify-between p-3 text-sm">
                    <span className="text-foreground">{who}</span>
                    <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                      {date}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Counts reflect verified Stripe state. Complimentary accounts are counted separately
                and never as paying subscribers.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </Screen>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* ─────────────────────────── product frame ─────────────────────────── */

function Screen({ title, meta, back, admin, children }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {back && <ChevronLeft className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm text-muted-foreground">{back ?? (admin ? "Admin" : "Overload")}</span>
        </div>
        {meta && <span className="text-xs tabular-nums text-muted-foreground">{meta}</span>}
      </div>
      <div className="px-4 py-4">
        <h1 className="mb-4 text-lg font-semibold text-foreground">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────── preview chrome ─────────────────────────── */

const SCREENS = {
  "Plan & Billing — Trial": () => <PlanBillingScreen stateKey="trial" />,
  "Plan & Billing — Free": () => <PlanBillingScreen stateKey="free" />,
  "Plan & Billing — Paid Monthly": () => <PlanBillingScreen stateKey="paidMonthly" />,
  "Plan & Billing — Paid Annual": () => <PlanBillingScreen stateKey="paidAnnual" />,
  "Plan & Billing — Complimentary": () => <PlanBillingScreen stateKey="comp" />,
  "Plan & Billing — Canceling": () => <PlanBillingScreen stateKey="canceling" />,
  "Plan & Billing — Payment problem": () => <PlanBillingScreen stateKey="grace" />,
  "Plan & Billing — Verify before checkout": () => <PlanBillingScreen stateKey="free" variant="verify" />,
  "Plan & Billing — Success return": () => <PlanBillingScreen stateKey="trial" variant="success" />,
  "Plan & Billing — Cancelled return": () => <PlanBillingScreen stateKey="trial" variant="cancelled" />,
  "Plan & Billing — Checkout error": () => <PlanBillingScreen stateKey="free" variant="error" />,
  "Plan & Billing — Loading": () => <PlanBillingScreen stateKey="trial" variant="loading" />,
  "Free lifter — upgrade note": () => <FreeExerciseCard />,
  "Settings — trial sub-label": () => <SettingsIndex stateKey="trial" />,
  "Admin — entitlement (comp)": () => <AdminEntitlementSection kind="comp" />,
  "Admin — entitlement (paying)": () => <AdminEntitlementSection kind="paying" />,
  "Admin — entitlement (free)": () => <AdminEntitlementSection kind="free" />,
  "Admin — grant comp dialog": () => <AdminEntitlementSection kind="free" />, // open via button
  "Admin — billing overview": () => <AdminBillingOverview />,
  "Admin — billing overview (empty)": () => <AdminBillingOverview variant="empty" />,
};

// Theme tokens from overload-ui-design, so the preview renders with real colors.
const THEME_CSS = `
.ovl-light{
  --background:#F7F7F8; --card:#FFFFFF; --muted:#EEEEF1; --muted-foreground:#5F5F68;
  --foreground:#0E0E10; --border:#E4E4E8; --primary:#3F5BD9; --primary-foreground:#FFFFFF;
  --ring:#3F5BD9; --destructive:#C0392B; --destructive-foreground:#FFFFFF;
}
.ovl-dark{
  --background:#0B0B0C; --card:#141416; --muted:#1C1C1F; --muted-foreground:#A1A1A8;
  --foreground:#F2F2F3; --border:#26262A; --primary:#7B93FF; --primary-foreground:#0B0B0C;
  --ring:#7B93FF; --destructive:#E0564A; --destructive-foreground:#0B0B0C;
}
.ovl-root{ background:var(--background); color:var(--foreground); }
.bg-background{background:var(--background);} .bg-card{background:var(--card);}
.bg-muted{background:var(--muted);} .bg-muted\\/40{background:color-mix(in srgb,var(--muted) 40%,transparent);}
.bg-muted\\/30{background:color-mix(in srgb,var(--muted) 30%,transparent);} .bg-muted\\/20{background:color-mix(in srgb,var(--muted) 20%,transparent);}
.bg-muted\\/80{background:color-mix(in srgb,var(--muted) 80%,transparent);}
.text-foreground{color:var(--foreground);} .text-muted-foreground{color:var(--muted-foreground);}
.text-primary{color:var(--primary);} .text-primary-foreground{color:var(--primary-foreground);}
.bg-primary{background:var(--primary);} .bg-primary\\/10{background:color-mix(in srgb,var(--primary) 10%,transparent);}
.bg-primary\\/90{background:color-mix(in srgb,var(--primary) 90%,transparent);}
.text-destructive-foreground{color:var(--destructive-foreground);} .bg-destructive{background:var(--destructive);}
.bg-destructive\\/90{background:color-mix(in srgb,var(--destructive) 90%,transparent);}
.border-border{border-color:var(--border);} .divide-border>*+*{border-color:var(--border);}
.ring-primary\\/40{box-shadow:0 0 0 1px color-mix(in srgb,var(--primary) 40%,transparent);}
.ring-ring{} .focus-visible\\:ring-ring:focus-visible{outline:2px solid var(--ring);}
`;

export default function Preview() {
  const [screen, setScreen] = React.useState(Object.keys(SCREENS)[0]);
  const [dark, setDark] = React.useState(true);
  const [narrow, setNarrow] = React.useState(true);
  const Active = SCREENS[screen];

  return (
    <div style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <style>{THEME_CSS}</style>
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-300 bg-neutral-100 p-3 text-sm text-neutral-800">
        <strong className="mr-1">Plans, Billing &amp; Promo Codes</strong>
        <select
          value={screen}
          onChange={(e) => setScreen(e.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1"
        >
          {Object.keys(SCREENS).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded border border-neutral-300 bg-white px-2 py-1" onClick={() => setDark((d) => !d)}>
          {dark ? "Dark" : "Light"}
        </button>
        <button className="rounded border border-neutral-300 bg-white px-2 py-1" onClick={() => setNarrow((n) => !n)}>
          {narrow ? "Phone (375px)" : "Wide"}
        </button>
        <span className="text-neutral-500">preview chrome — not product UI</span>
      </div>

      <div className={cx("ovl-root", dark ? "ovl-dark" : "ovl-light")} style={{ minHeight: 640, padding: 16 }}>
        <div style={{ maxWidth: narrow ? 375 : 760, margin: "0 auto" }}>
          <div className="rounded-xl border border-border bg-background overflow-hidden">
            <Active />
          </div>
        </div>
      </div>
    </div>
  );
}
