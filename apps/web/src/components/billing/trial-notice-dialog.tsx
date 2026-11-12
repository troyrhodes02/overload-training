"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { markTrialNoticeShownAction } from "@/app/(app)/trial-notice-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TrialNoticeData } from "@/lib/billing/trial-notice";

/**
 * Trial notices (OVE-112; chores/ove-112-trial-upgrade-ux/preview.tsx). A
 * quiet account notice, not an advert: one dialog, once per account per
 * phase, never a banner or countdown, and never a redirect to Checkout.
 *
 * Like What's New: the moment it opens, the account is recorded as having
 * seen it, so it shows once whatever happens next (a button, ✕, Escape, the
 * scrim, a reload, or closing the tab). If the open-time save failed, closing
 * retries it once; the worst case is one more appearance on the next load.
 * Only the FIRST render of a visit counts, so it can never open mid-visit
 * over the logging card.
 *
 * `purchasable` false (billing off, or inside an app shell): the notice keeps
 * its facts, drops every purchase sentence and action, and offers "Got it".
 */

export function trialNoticeCopy(
  data: Pick<TrialNoticeData, "phase" | "purchasable"> & {
    endsToday?: boolean;
  },
): { title: string; body: string; primary: string | null; secondary: string } {
  const buy = data.purchasable;
  if (data.phase === "ending") {
    const when = data.endsToday ? "today" : "tomorrow";
    return {
      title: `Your Pro trial ends ${when}`,
      body: `Your free Pro trial ${
        data.endsToday ? "ends today" : "has one day left"
      }. When it ends, you'll keep your workouts, plans, and training history, but Pro insights and advanced tracking features will no longer be available${
        buy ? " unless you subscribe." : "."
      }`,
      primary: buy ? "Keep Pro" : null,
      secondary: buy ? "Maybe later" : "Got it",
    };
  }
  return {
    title: "Your Pro trial has ended",
    body: `Your free Pro trial has ended. You're now on Overload Free, so you can still plan workouts, log sets, and access your training history.${
      buy
        ? " Subscribe to Pro whenever you're ready to get your advanced progression insights back."
        : ""
    }`,
    primary: buy ? "Upgrade to Pro" : null,
    secondary: buy ? "Continue with Free" : "Got it",
  };
}

export function TrialNoticeDialog({ data }: { data: TrialNoticeData | null }) {
  const [shown] = useState(data);
  if (!shown) return null;
  return <TrialNoticeBody data={shown} />;
}

function TrialNoticeBody({ data }: { data: TrialNoticeData }) {
  const [open, setOpen] = useState(true);
  const secondary = useRef<HTMLButtonElement>(null);
  const saved = useRef<Promise<boolean> | null>(null);
  const retried = useRef(false);
  const { phase } = data;

  useEffect(() => {
    saved.current ??= markTrialNoticeShownAction(phase).then(
      (result) => result.ok,
      () => false,
    );
  }, [phase]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next || retried.current || !saved.current) return;
    retried.current = true;
    void saved.current.then((ok) => {
      if (!ok) void markTrialNoticeShownAction(phase).catch(() => {});
    });
  }

  const copy = trialNoticeCopy({
    phase,
    purchasable: data.purchasable,
    endsToday: data.phase === "ending" ? data.endsToday : false,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          // Focus the dismiss action, so Enter never starts a purchase.
          event.preventDefault();
          secondary.current?.focus();
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {copy.body}
          </DialogDescription>
        </DialogHeader>
        {data.highlights.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pro adds
            </p>
            <ul className="space-y-1.5 text-sm">
              {data.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button
              ref={secondary}
              variant={copy.primary ? "ghost" : "default"}
              className="h-11 w-full sm:h-9 sm:w-auto"
            >
              {copy.secondary}
            </Button>
          </DialogClose>
          {copy.primary ? (
            <Button asChild className="h-11 w-full sm:h-9 sm:w-auto">
              <Link
                href="/settings/billing#subscribe"
                onClick={() => onOpenChange(false)}
              >
                {copy.primary}
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
