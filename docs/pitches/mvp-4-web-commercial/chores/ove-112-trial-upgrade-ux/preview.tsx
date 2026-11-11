/**
 * OVE-112 — Trial upgrade UX & trial notices. Scaled UI preview (a chore, not
 * a pitch): exactly the three changed surfaces.
 *   01 Trial notice — "ends tomorrow"   (web: Keep Pro / Maybe later)
 *   02 Trial notice — "has ended"       (web: Upgrade to Pro / Continue with Free)
 *   03 Plan & Billing — Subscribe step  (pick monthly/annual, then a disclosure
 *      before Stripe; a trial account is told paid billing starts today)
 * App-shell variant (iOS): the notices keep their facts and drop every
 * purchase sentence and action, leaving one "Got it". Plan & Billing shows the
 * plan read-only. Self-contained: inline mock data, no data imports.
 */
"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const HIGHLIGHTS = [
  "Progress, hold, and deload calls, with the weight to try and why, using your RIR",
  "Estimated one-rep max trends and stall detection",
  "Rep records and the call each past session led to",
];

type Screen = "ending" | "ended" | "subscribe";

function Highlights() {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Pro adds
      </p>
      <ul className="space-y-1.5 text-sm">
        {HIGHLIGHTS.map((h) => (
          <li key={h} className="flex gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notice({ phase, shell }: { phase: "ending" | "ended"; shell: boolean }) {
  const ending = phase === "ending";
  return (
    <Dialog open>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>
            {ending ? "Your Pro trial ends tomorrow" : "Your Pro trial has ended"}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {ending
              ? `Your free Pro trial has one day left. When it ends, you'll keep your workouts, plans, and training history, but Pro insights and advanced tracking features will no longer be available${shell ? "." : " unless you subscribe."}`
              : `Your free Pro trial has ended. You're now on Overload Free, so you can still plan workouts, log sets, and access your training history.${shell ? "" : " Subscribe to Pro whenever you're ready to get your advanced progression insights back."}`}
          </DialogDescription>
        </DialogHeader>
        <Highlights />
        <DialogFooter className="gap-2">
          {shell ? (
            <Button className="h-11 w-full sm:h-9 sm:w-auto">Got it</Button>
          ) : (
            <>
              <Button variant="ghost" className="h-11 sm:h-9">
                {ending ? "Maybe later" : "Continue with Free"}
              </Button>
              <Button className="h-11 sm:h-9">
                {ending ? "Keep Pro" : "Upgrade to Pro"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Subscribe({ trial }: { trial: boolean }) {
  const [pick, setPick] = React.useState<"month" | "year" | null>(null);
  const price = pick === "year" ? "$39.99" : "$4.99";
  const per = pick === "year" ? "year" : "month";
  return (
    <div className="mx-auto max-w-screen-sm space-y-5 px-4 py-6">
      <h1 className="text-xl font-semibold">Plan &amp; Billing</h1>
      <div className="rounded-lg border border-border bg-card p-4">
        <span className="text-base font-medium">
          {trial ? "Pro — trial · 3 days left" : "Free"}
        </span>
        <p className="mt-1 text-sm text-muted-foreground">
          {trial
            ? "You have full Pro during your trial. After it ends you move to Free, with nothing lost."
            : "You have the full training tracker. Pro adds Overload's reading of your training."}
        </p>
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Subscribe to Pro</p>
          {pick === null ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="h-11 flex-1 sm:h-9" onClick={() => setPick("month")}>
                Monthly — $4.99/mo
              </Button>
              <Button variant="outline" className="h-11 flex-1 sm:h-9" onClick={() => setPick("year")}>
                Annual — $39.99/yr
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-sm">
                <span className="font-medium tabular-nums">Pro {pick === "year" ? "Annual" : "Monthly"} — {price}/{per}.</span>{" "}
                {trial
                  ? `Subscribing now starts paid billing today: ${price} is charged when you complete checkout, then every ${per}. The rest of your free trial isn't added on.`
                  : `${price} is charged when you complete checkout, then every ${per}. Cancel anytime.`}
              </p>
              <p className="text-xs text-muted-foreground">
                Checkout is on Stripe. Leaving it without paying changes nothing{trial ? ", and your trial continues" : ""}.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
                <Button className="h-11 sm:h-9">Continue to checkout</Button>
                <Button variant="ghost" className="h-11 sm:h-9" onClick={() => setPick(null)}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Preview() {
  const [screen, setScreen] = React.useState<Screen>("ending");
  const [shell, setShell] = React.useState(false);
  const [trial, setTrial] = React.useState(true);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Preview chrome — not product UI. */}
      <div className="flex flex-wrap gap-2 border-b border-border p-2 text-xs">
        {(["ending", "ended", "subscribe"] as const).map((s) => (
          <Button key={s} size="sm" variant={screen === s ? "default" : "outline"} onClick={() => setScreen(s)}>
            {s}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => setShell((v) => !v)}>
          {shell ? "app shell" : "web"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setTrial((v) => !v)}>
          {trial ? "trial" : "free"}
        </Button>
      </div>
      {screen === "subscribe" ? <Subscribe trial={trial} /> : <Notice phase={screen} shell={shell} />}
    </div>
  );
}
