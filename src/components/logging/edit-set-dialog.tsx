"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editLoggedSetAction } from "@/app/(app)/history/actions";
import { RirPicker } from "@/components/logging/rir-picker";

/**
 * Past-log correction (design Screen 9; Resolved Decisions 51–54). Weight and
 * reps only; positive-only; no delete; no baseline replay. A bodyweight
 * exercise (requiresExternalWeight false) corrects reps only — there is no
 * weight field and none is sent. Client island.
 *
 * Faster Logging UX (R17): the logging card opens this same dialog from a
 * logged row by passing its own `trigger`; History keeps the default "edit"
 * link. Every open starts from the stored values, never a leftover edit.
 *
 * RIR Logging & Autoregulation (design Screen 3, preview §04; R9): the stored
 * RIR can be changed or cleared. Save always sends it back — the stored value
 * when untouched, null when cleared ("not recorded", never 0).
 */
export function EditSetDialog({
  loggedSetId,
  setNumber,
  exerciseName,
  requiresExternalWeight,
  weightLbs,
  reps,
  rir,
  trigger,
}: {
  loggedSetId: string;
  setNumber: number;
  exerciseName: string;
  requiresExternalWeight: boolean;
  weightLbs: number | null;
  reps: number;
  /** The stored reps in reserve; null = not recorded. */
  rir: number | null;
  /** The element that opens the dialog; defaults to History's "edit" link. */
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState(
    weightLbs === null ? "" : String(weightLbs),
  );
  const [repsValue, setRepsValue] = useState(String(reps));
  const [rirValue, setRirValue] = useState<number | null>(rir);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (next) {
      setWeight(weightLbs === null ? "" : String(weightLbs));
      setRepsValue(String(reps));
      setRirValue(rir);
      setError(null);
    }
    setOpen(next);
  }

  function save() {
    const w = Number(weight);
    const r = Number(repsValue);
    if (requiresExternalWeight && (!weight || !Number.isFinite(w) || w <= 0)) {
      setError("Enter a weight above 0.");
      return;
    }
    if (!repsValue || !Number.isInteger(r) || r <= 0) {
      setError("Enter reps above 0.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await editLoggedSetAction({
        loggedSetId,
        weightLbs: requiresExternalWeight ? w : null,
        reps: r,
        rir: rirValue,
      });
      if (res.ok) {
        toast.success("Set updated");
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button className="text-xs text-muted-foreground underline">
            edit
          </button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit set {setNumber} — {exerciseName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 tabular-nums">
          {requiresExternalWeight ? (
            <div>
              <Label htmlFor={`w-${loggedSetId}`}>Weight (lbs)</Label>
              <Input
                id={`w-${loggedSetId}`}
                inputMode="decimal"
                className="mt-1 h-11"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Bodyweight — reps only.
            </p>
          )}
          <div>
            <Label htmlFor={`r-${loggedSetId}`}>Reps</Label>
            <Input
              id={`r-${loggedSetId}`}
              inputMode="numeric"
              className="mt-1 h-11"
              value={repsValue}
              onChange={(e) => setRepsValue(e.target.value)}
            />
          </div>
          <div>
            <p id={`rir-${loggedSetId}`} className="text-sm font-medium">
              RIR (optional)
            </p>
            <div className="mt-1">
              <RirPicker
                label={`Set ${setNumber} RIR (reps in reserve, optional)`}
                showLabel={false}
                value={rirValue}
                disabled={pending}
                onChange={setRirValue}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {rirValue === null
                ? "Not recorded."
                : "Tap the selected value to clear."}
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={save} disabled={pending}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
