"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Plans, Billing & Promo Codes — the one quiet, dismissible line shown where a
 * Pro result was withheld for a Free account (design doc Screen 4). One per
 * surface, never a banner/countdown/toast. Dismissal is a cosmetic preference
 * kept in localStorage per surface (spec RD-15), so the lifter is not re-sold
 * the same thing each visit. The surrounding Free content stays fully usable.
 *
 * The server already withheld the Pro value (query-layer gate); this note is
 * presentation only — hiding it is never the enforcement.
 */
export function UpgradeNote({
  surface,
  feature = "Progression insights",
}: {
  /** Stable per-surface key, e.g. "exercise-card" or "exercise-page". */
  surface: string;
  /** Plain name of the withheld Pro feature, shown in the sentence. */
  feature?: string;
}) {
  const storageKey = `overload.upgradeNote.dismissed.${surface}`;
  // Initial dismissed state is read from localStorage on the client (false on
  // the server, so the note is never rendered into the HTML and there is no
  // hydration flash of a note the lifter already dismissed). A local flag
  // handles the just-clicked case without a setState-in-effect.
  const persisted = React.useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.localStorage.getItem(storageKey) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );
  const [dismissedNow, setDismissedNow] = React.useState(false);

  if (persisted || dismissedNow) return null;

  return (
    <div className="mt-3 flex items-start justify-between gap-3 border-t border-border pt-3">
      <p className="text-sm text-muted-foreground">
        {feature} are part of Pro.{" "}
        <Link
          href="/settings/billing"
          className="text-primary underline-offset-2 hover:underline"
        >
          See the call and why
        </Link>
        .
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0"
        aria-label={`Dismiss — ${feature} are part of Pro`}
        onClick={() => {
          try {
            window.localStorage.setItem(storageKey, "1");
          } catch {
            // A private-mode failure just means the note returns next visit.
          }
          setDismissedNow(true);
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
