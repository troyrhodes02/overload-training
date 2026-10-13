"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ChevronRight, CircleAlert, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  addPlannedCardioAction,
  removePlannedCardioAction,
  updatePlannedCardioAction,
} from "@/app/(app)/plan/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CardioActivityInput,
  MinutesInput,
} from "@/components/cardio/cardio-fields";
import { DAYS_OF_WEEK, dayName } from "@/lib/plan/calendar";
import { parseCardioEntry } from "@/lib/cardio/validation";
import type { PlannedCardioDto } from "@/lib/plan/queries";

/**
 * Planned cardio in the mesocycle builder (Cardio Logging design Screens 1–3).
 * Cardio belongs to the day, never to a Session: these controls sit in the
 * week, not on the session screen. One item per day — days that already have
 * cardio are listed but disabled. Plan authoring only: logged cardio is a
 * separate record that nothing here can change.
 */

/** What each weekday holds, for the day picker's notes. */
export type CardioDayDto = {
  dayOfWeek: number;
  sessionName: string | null;
  cardioId: string | null;
};

function InlineError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

type Errors = { dayOfWeek?: string; type?: string; durationMin?: string };

function PlannedCardioDialog({
  open,
  onOpenChange,
  mesocycleId,
  days,
  editing,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mesocycleId: string;
  days: CardioDayDto[];
  /** The item being edited; absent when adding. */
  editing?: PlannedCardioDto;
  onRemove?: () => void;
}) {
  const firstFree = days.find((d) => d.cardioId === null)?.dayOfWeek ?? 1;
  const [day, setDay] = useState(String(editing?.dayOfWeek ?? firstFree));
  const [type, setType] = useState(editing?.type ?? "");
  const [minutes, setMinutes] = useState(
    editing ? String(editing.durationMin) : "",
  );
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setDay(String(editing?.dayOfWeek ?? firstFree));
      setType(editing?.type ?? "");
      setMinutes(editing ? String(editing.durationMin) : "");
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
      const payload = {
        dayOfWeek: Number(day),
        type,
        durationMin: minutes,
      };
      const result = editing
        ? await updatePlannedCardioAction({
            plannedCardioId: editing.id,
            ...payload,
          })
        : await addPlannedCardioAction({ mesocycleId, ...payload });
      if (result.ok) {
        close(false);
        toast.success(
          editing
            ? "Cardio updated"
            : `${parsed.value.type} added to ${dayName(Number(day))}`,
          { duration: 4000 },
        );
        return;
      }
      const details = result.error.details ?? {};
      if (details.dayOfWeek || details.type || details.durationMin) {
        setErrors(details);
        return;
      }
      setError(result.error.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader className="text-left">
            <DialogTitle>{editing ? "Edit cardio" : "Add cardio"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Changes the plan only. Cardio you've logged stays as recorded."
                : "One cardio item per day."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pc-day">Day</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger
                id="pc-day"
                className="h-11 w-full"
                aria-invalid={Boolean(errors.dayOfWeek)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((d) => {
                  const info = days[d.day - 1];
                  const taken =
                    info.cardioId !== null && info.cardioId !== editing?.id;
                  const note = [
                    info.sessionName ?? "Rest",
                    taken ? "has cardio" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <SelectItem
                      key={d.day}
                      value={String(d.day)}
                      disabled={taken}
                    >
                      {d.long}
                      <span className="text-xs text-muted-foreground">
                        {note}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {errors.dayOfWeek && (
              <p role="alert" className="text-sm text-destructive">
                {errors.dayOfWeek}
              </p>
            )}
          </div>
          <CardioActivityInput
            id="pc-type"
            value={type}
            error={errors.type}
            onChange={(v) => {
              setType(v);
              setErrors((e) => ({ ...e, type: undefined }));
            }}
          />
          <MinutesInput
            id="pc-minutes"
            value={minutes}
            error={errors.durationMin}
            onChange={(v) => {
              setMinutes(v);
              setErrors((e) => ({ ...e, durationMin: undefined }));
            }}
          />
          {error && <InlineError message={error} />}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            {editing && onRemove && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  close(false);
                  onRemove();
                }}
              >
                Remove from plan
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : editing ? "Save" : "Add cardio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Remove planned cardio: plan authoring, confirmed; logs are never touched. */
function RemoveCardioConfirm({
  open,
  onOpenChange,
  cardio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardio: PlannedCardioDto;
}) {
  const [isPending, startTransition] = useTransition();
  const day = dayName(cardio.dayOfWeek);
  function remove() {
    startTransition(async () => {
      const result = await removePlannedCardioAction(cardio.id);
      if (!result.ok) {
        toast.error(result.error.message, { duration: Infinity });
        return;
      }
      onOpenChange(false);
      toast(`Removed from ${day}. Logged cardio stays.`, { duration: 5000 });
    });
  }
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>
            Remove {cardio.type} from {day}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            It comes off the plan from now on. Cardio you&apos;ve already logged
            stays in your history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Keep it</AlertDialogCancel>
          {/* Authoring, not destruction: outline, never destructive red. */}
          <Button variant="outline" onClick={remove} disabled={isPending}>
            {isPending ? "Removing…" : "Remove"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** "+ Add cardio" under the week. Disabled once every day has cardio. */
export function AddCardioButton({
  mesocycleId,
  days,
}: {
  mesocycleId: string;
  days: CardioDayDto[];
}) {
  const [open, setOpen] = useState(false);
  const full = days.every((d) => d.cardioId !== null);
  return (
    <div className="mt-3 space-y-1">
      <Button
        variant="outline"
        size="sm"
        disabled={full}
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden />
        Add cardio
      </Button>
      {full && (
        <p className="text-xs text-muted-foreground">
          Every day already has cardio.
        </p>
      )}
      {open && (
        <PlannedCardioDialog
          open={open}
          onOpenChange={setOpen}
          mesocycleId={mesocycleId}
          days={days}
        />
      )}
    </div>
  );
}

/** The cardio line inside a day row; tap to edit (or remove). */
export function PlannedCardioLine({
  mesocycleId,
  cardio,
  days,
}: {
  mesocycleId: string;
  cardio: PlannedCardioDto;
  days: CardioDayDto[];
}) {
  const [dialog, setDialog] = useState<"edit" | "remove" | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setDialog("edit")}
        aria-label={`Edit cardio: ${cardio.type}, ${cardio.durationMin} minutes, ${dayName(cardio.dayOfWeek)}`}
        className="ml-10 flex min-h-11 w-[calc(100%-2.5rem)] items-center gap-2 rounded-md pr-3 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <CardioLineContent cardio={cardio} />
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </button>
      {dialog === "edit" && (
        <PlannedCardioDialog
          open
          onOpenChange={(o) => setDialog(o ? "edit" : null)}
          mesocycleId={mesocycleId}
          days={days}
          editing={cardio}
          onRemove={() => setDialog("remove")}
        />
      )}
      <RemoveCardioConfirm
        open={dialog === "remove"}
        onOpenChange={(o) => setDialog(o ? "remove" : null)}
        cardio={cardio}
      />
    </>
  );
}

/** Label + "Activity · N min" (shared with the read-only archived line). */
export function CardioLineContent({ cardio }: { cardio: PlannedCardioDto }) {
  return (
    <>
      <span className="text-xs tracking-wide text-muted-foreground uppercase">
        Cardio
      </span>
      <span className="min-w-0 flex-1 truncate tabular-nums">
        {cardio.type} · {cardio.durationMin} min
      </span>
    </>
  );
}
