"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Check, ChevronRight, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { logCardioAction } from "@/app/(app)/log/actions";
import { editCardioLogAction } from "@/app/(app)/history/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CardioActivityInput,
  MinutesInput,
} from "@/components/cardio/cardio-fields";
import type { CardioOccurrenceDto } from "@/lib/cardio/queries";
import { parseCardioEntry } from "@/lib/cardio/validation";
import { cn } from "@/lib/utils";

/**
 * Log cardio / correct cardio (Cardio Logging design Screens 5 and 7). Two
 * fields — activity and whole minutes — prefilled from the plan when logging
 * and from the record when correcting. Opening writes nothing; a retry never
 * records twice (the server returns the existing record); there is no delete.
 * Client island: it calls server actions only.
 */

type Errors = { type?: string; durationMin?: string };

export function plannedLabel(entry: CardioOccurrenceDto): string {
  return `${entry.planned.type} · ${entry.planned.durationMin} min`;
}

/** "Planned 20 min" or "Planned Incline Walk · 20 min" — only when different. */
export function plannedComparison(entry: CardioOccurrenceDto): string | null {
  if (!entry.log || !entry.differsFromPlan) return null;
  return entry.log.type === entry.planned.type
    ? `Planned ${entry.planned.durationMin} min`
    : `Planned ${plannedLabel(entry)}`;
}

export function CardioLogDialog({
  open,
  onOpenChange,
  entry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: CardioOccurrenceDto;
}) {
  const correcting = entry.log !== null;
  const start = entry.log ?? entry.planned;
  const [type, setType] = useState(start.type);
  const [minutes, setMinutes] = useState(String(start.durationMin));
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setType(start.type);
      setMinutes(String(start.durationMin));
      setErrors({});
      setError(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseCardioEntry({ type, durationMin: minutes });
    if (!parsed.ok) {
      setErrors(parsed.details);
      return;
    }
    setErrors({});
    setError(null);
    startTransition(async () => {
      if (entry.log) {
        const result = await editCardioLogAction({
          cardioLogId: entry.log.id,
          type,
          durationMin: minutes,
        });
        if (result.ok) {
          onOpenChange(false);
          toast.success("Cardio updated", { duration: 4000 });
          return;
        }
        if (result.error.details) setErrors(result.error.details);
        else setError(result.error.message);
        return;
      }
      const result = await logCardioAction({
        mesocycleId: entry.mesocycleId,
        scheduledFor: entry.scheduledFor,
        type,
        durationMin: minutes,
      });
      if (result.ok) {
        onOpenChange(false);
        if (result.data.alreadyLogged)
          toast("Already logged", { duration: 4000 });
        else toast.success("Cardio logged", { duration: 4000 });
        return;
      }
      if (result.error.details) setErrors(result.error.details);
      else setError(result.error.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader className="text-left">
            <DialogTitle>
              {correcting ? "Edit cardio" : "Log cardio"}
            </DialogTitle>
            <DialogDescription className="tabular-nums">
              {entry.dateLabel} · Planned {plannedLabel(entry)}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <CardioActivityInput
            id="cl-type"
            value={type}
            error={errors.type}
            onChange={(v) => {
              setType(v);
              setErrors((e) => ({ ...e, type: undefined }));
            }}
          />
          <MinutesInput
            id="cl-minutes"
            value={minutes}
            error={errors.durationMin}
            autoFocus
            onChange={(v) => {
              setMinutes(v);
              setErrors((e) => ({ ...e, durationMin: undefined }));
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Opens Log cardio for a pending (or missed) occurrence. */
export function LogCardioButton({
  entry,
  variant = "secondary",
  className,
  children = "Log",
}: {
  entry: CardioOccurrenceDto;
  variant?: "default" | "secondary" | "ghost";
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        className={cn("h-11", className)}
        aria-label={`Log cardio: ${entry.planned.type}, ${entry.dateLabel}`}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      {open && (
        <CardioLogDialog open={open} onOpenChange={setOpen} entry={entry} />
      )}
    </>
  );
}

/** A logged entry: ✓ actual (and the plan, when different); tap to correct. */
export function LoggedCardioButton({
  entry,
  large,
}: {
  entry: CardioOccurrenceDto;
  large?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!entry.log) return null;
  const comparison = plannedComparison(entry);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Edit cardio: ${entry.log.type}, ${entry.log.durationMin} minutes, ${entry.dateLabel}`}
        className="flex min-h-11 w-full items-center gap-2 rounded-md text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Check aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">Logged:</span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block tabular-nums",
              large ? "text-base" : "text-sm",
            )}
          >
            {entry.log.type} — {entry.log.durationMin} min
          </span>
          {comparison && (
            <span className="block text-xs text-muted-foreground tabular-nums">
              {comparison}
            </span>
          )}
        </span>
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </button>
      {open && (
        <CardioLogDialog
          key={`${entry.log.type}-${entry.log.durationMin}`}
          open={open}
          onOpenChange={setOpen}
          entry={entry}
        />
      )}
    </>
  );
}
