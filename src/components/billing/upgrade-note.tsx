"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UPGRADE_HREF } from "@/lib/billing/config";

/**
 * Plans, Billing & Promo Codes — the one quiet, dismissible invitation shown
 * where a Pro result was withheld for a Free account (design doc Screen 4;
 * Entitlement Audit). One per surface, never a banner, countdown, modal, or
 * toast, and never a blurred or faked preview of the withheld value. The
 * surrounding Free content stays fully usable.
 *
 * Two shapes of the same component:
 *   - `inline` (default): one plain sentence and "Explore Pro", under a divider
 *     inside the card it belongs to (logging card, Today list, day complete).
 *   - `block`: a title line, one sentence, and "Explore Pro" in a hairline
 *     bordered box, standing in the place of the withheld section (exercise
 *     history).
 *
 * It renders only when the server marked a result as withheld (`locked`), so a
 * Pro, trial, or comp account never sees it, and a Free account with no
 * history (nothing withheld) sees its normal empty state instead.
 *
 * Dismissal is a cosmetic preference kept in localStorage per surface (spec
 * RD-15), so the lifter is not re-sold the same thing each visit. The server
 * already withheld the Pro value (query-layer gate); this note is presentation
 * only — hiding it is never the enforcement.
 */
export function UpgradeNote({
  surface,
  message,
  title,
  variant = "inline",
}: {
  /** Stable per-surface key, e.g. "exercise-card" or "exercise-page". */
  surface: string;
  /** One plain sentence naming what Pro adds here. */
  message: string;
  /** Block variant only: a short title line above the sentence. */
  title?: string;
  variant?: "inline" | "block";
}) {
  const storageKey = `overload.upgradeNote.dismissed.${surface}`;
  const titleId = React.useId();
  // Initial dismissed state is read from localStorage on the client (true on
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
    <UpgradeNoteView
      message={message}
      title={title}
      variant={variant}
      titleId={titleId}
      onDismiss={() => {
        try {
          window.localStorage.setItem(storageKey, "1");
        } catch {
          // A private-mode failure just means the note returns next visit.
        }
        setDismissedNow(true);
      }}
    />
  );
}

/**
 * The note's markup, with no state: exported so it can be rendered and
 * asserted on its own. Only `UpgradeNote` (above) decides whether it shows.
 */
export function UpgradeNoteView({
  message,
  title,
  variant = "inline",
  titleId,
  onDismiss,
}: {
  message: string;
  title?: string;
  variant?: "inline" | "block";
  titleId: string;
  onDismiss: () => void;
}) {
  const dismiss = (
    <Button
      variant="ghost"
      size="icon"
      className="-mr-2 -mt-2 h-11 w-11 shrink-0 text-muted-foreground"
      aria-label={`Dismiss: ${title ?? message}`}
      onClick={onDismiss}
    >
      <X aria-hidden className="h-4 w-4" />
    </Button>
  );

  const action = (
    <Link
      href={UPGRADE_HREF}
      className="rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Explore Pro
    </Link>
  );

  if (variant === "block") {
    return (
      <section
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Pro"}
        data-testid="upgrade-note"
        className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3.5"
      >
        <div className="min-w-0 space-y-1">
          {title ? (
            <h2 id={titleId} className="text-sm font-medium">
              {title}
            </h2>
          ) : null}
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="pt-1 text-sm">{action}</p>
        </div>
        {dismiss}
      </section>
    );
  }

  return (
    <div
      data-testid="upgrade-note"
      className="mt-3 flex items-start justify-between gap-3 border-t border-border pt-3"
    >
      <p className="text-sm text-muted-foreground">
        {message} {action}
      </p>
      {dismiss}
    </div>
  );
}
