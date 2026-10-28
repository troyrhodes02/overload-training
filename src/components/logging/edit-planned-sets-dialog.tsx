"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editPlannedSetsAction } from "@/app/(app)/history/actions";

/**
 * Per-session planned-sets correction. When the lifter logged fewer sets than
 * the plan called for and that shorter count was intentional, this lets them
 * lower the planned target for THIS workout only, so the complete-but-short
 * session counts toward progression again. It edits the logged snapshot, never
 * the Session template, and can only reduce the count (1..original). Client
 * island; mirrors EditSetDialog's save/refresh pattern.
 */
export function EditPlannedSetsDialog({
  loggedExerciseId,
  exerciseName,
  plannedSets,
  loggedWorkingSets,
}: {
  loggedExerciseId: string;
  exerciseName: string;
  /** The original planned-set snapshot (the correction's upper bound). */
  plannedSets: number;
  /** Working sets actually logged — the natural corrected target. */
  loggedWorkingSets: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(loggedWorkingSets));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (next) {
      setValue(String(loggedWorkingSets));
      setError(null);
    }
    setOpen(next);
  }

  function save() {
    const n = Number(value);
    if (!value || !Number.isInteger(n) || n < 1) {
      setError("Enter a whole number above 0.");
      return;
    }
    if (n > plannedSets) {
      setError(`You can only lower it (at most ${plannedSets}).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await editPlannedSetsAction({
        loggedExerciseId,
        plannedSets: n,
      });
      if (res.ok) {
        toast.success("Planned sets updated");
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <button
        type="button"
        className="shrink-0 text-xs text-primary underline underline-offset-4"
        onClick={() => onOpenChange(true)}
      >
        I meant to do fewer
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust planned sets — {exerciseName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 tabular-nums">
          <p className="text-sm text-muted-foreground">
            If you cut a set on purpose, set this workout&apos;s planned target
            to what you actually did. It counts this session toward your
            progress check and changes nothing in your plan.
          </p>
          <div>
            <Label htmlFor={`ps-${loggedExerciseId}`}>Planned sets</Label>
            <Input
              id={`ps-${loggedExerciseId}`}
              inputMode="numeric"
              className="mt-1 h-11"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Was {plannedSets}. You can lower it, not raise it.
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
