"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { CardioOccurrenceDto } from "@/lib/cardio/queries";
import {
  CardioLogDialog,
  LogCardioButton,
  plannedComparison,
} from "@/components/cardio/cardio-log-dialog";

/**
 * One cardio line in the week at a glance (Cardio Logging design Screen 6).
 * Logged → ✓ the actual activity and minutes (plus the plan, muted, when they
 * differ), tap to correct. Missed → muted "Missed" and an optional Log — a
 * fact, never a prompt. Today → Log. Later → "Upcoming". No colour beyond
 * foreground and muted; no delete anywhere.
 */
export function CardioHistoryLine({
  entry,
  dateLabel,
}: {
  entry: CardioOccurrenceDto;
  /** Shown only when the day has no lifting line above it. */
  dateLabel: string | null;
}) {
  const [open, setOpen] = useState(false);
  const shown = entry.log ?? entry.planned;
  const comparison = plannedComparison(entry);
  // Second line: the plan when the record differs, or "Missed" — kept off the
  // first line so the activity never truncates at phone width.
  const note = comparison ?? (entry.state === "missed" ? "Missed" : null);

  const body = (
    <>
      <span className="w-28 shrink-0 text-muted-foreground">{dateLabel}</span>
      <span className="min-w-0 flex-1">
        <span className="block">
          <span className="mr-2 text-xs tracking-wide text-muted-foreground uppercase">
            Cardio
          </span>
          {shown.type} · {shown.durationMin} min
        </span>
        {note && (
          <span className="block text-xs text-muted-foreground">{note}</span>
        )}
      </span>
    </>
  );

  if (entry.state === "complete") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit cardio: ${shown.type}, ${shown.durationMin} minutes, ${entry.dateLabel}`}
          className="flex min-h-11 w-full items-center px-4 py-2 text-left text-sm tabular-nums hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {body}
          <span className="flex items-center gap-1 text-muted-foreground">
            <Check aria-hidden className="size-4" />
            <span className="sr-only">Logged</span>
            <ChevronRight aria-hidden className="size-4" />
          </span>
        </button>
        {open && (
          <CardioLogDialog
            key={`${shown.type}-${shown.durationMin}`}
            open={open}
            onOpenChange={setOpen}
            entry={entry}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-11 items-center px-4 py-1 text-sm tabular-nums">
      {body}
      {entry.state === "upcoming" ? (
        <span className="text-muted-foreground">Upcoming</span>
      ) : (
        <LogCardioButton entry={entry} variant="ghost" className="px-3">
          Log
        </LogCardioButton>
      )}
    </div>
  );
}
