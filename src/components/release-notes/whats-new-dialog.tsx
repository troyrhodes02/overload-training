"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { markReleaseNotesSeenAction } from "@/app/(app)/release-notes-actions";
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
import type { WhatsNewDialogData } from "@/lib/release-notes/seen";
import { ReleaseNote } from "./release-note";

/**
 * The What's New dialog (design doc Screens 1–2, preview §01–§02; spec R13,
 * R16, R18). The layout renders it only when the account has significant
 * entries it hasn't seen, with all of them, newest first, in one dialog.
 *
 * The moment it opens, the account is recorded as having seen everything
 * through `throughId`, so it shows once whatever happens next — Got it, ✕,
 * Escape, the scrim, a reload, or closing the tab. Closing records nothing
 * more; if the open-time save failed, closing retries it once. A failure is
 * silent: the worst case is one more appearance on the next load.
 *
 * Only what the FIRST render of this visit carries counts. The shell keeps
 * this component mounted across client navigation and every refresh() (a
 * logged set, a saved setting), which re-render the layout; a later value is
 * ignored, so the dialog can never open mid-visit — over the logging card or
 * the tour — only on a full load (design doc Screen 1; review r4331392480).
 */
export function WhatsNewDialog({ data }: { data: WhatsNewDialogData | null }) {
  const [shown] = useState(data);
  if (!shown) return null;
  return <WhatsNewDialogBody {...shown} />;
}

function WhatsNewDialogBody({ entries, throughId }: WhatsNewDialogData) {
  const [open, setOpen] = useState(true);
  const gotIt = useRef<HTMLButtonElement>(null);
  const saved = useRef<Promise<boolean> | null>(null);
  const retried = useRef(false);

  useEffect(() => {
    // Once per mount (dev StrictMode replays effects; the save is idempotent
    // anyway, but there is no reason to send it twice).
    saved.current ??= markReleaseNotesSeenAction(throughId).then(
      (result) => result.ok,
      () => false,
    );
  }, [throughId]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next || retried.current || !saved.current) return;
    retried.current = true;
    void saved.current.then((ok) => {
      if (!ok) void markReleaseNotesSeenAction(throughId).catch(() => {});
    });
  }

  const count = entries.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          gotIt.current?.focus();
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle>What&apos;s new</DialogTitle>
          <DialogDescription>
            {count === 1 ? (
              "Since you were last here"
            ) : (
              <>
                <span className="tabular-nums">{count}</span> updates since you
                were last here
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 overflow-y-auto px-6">
          <ol className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="py-4 first:pt-0 last:pb-0">
                <ReleaseNote entry={entry} headingLevel={3} />
              </li>
            ))}
          </ol>
        </div>
        <DialogFooter className="items-center">
          <Button asChild variant="link" className="h-11 sm:h-9">
            <Link
              href="/settings/whats-new"
              onClick={() => onOpenChange(false)}
            >
              See all updates
            </Link>
          </Button>
          <DialogClose asChild>
            <Button ref={gotIt} className="h-11 w-full sm:h-9 sm:w-auto">
              Got it
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
