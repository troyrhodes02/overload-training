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

/**
 * Past-log correction (design Screen 9; Resolved Decisions 51–54). Weight and
 * reps only; positive-only; no delete; no baseline replay. Client island.
 */
export function EditSetDialog({
  loggedSetId,
  setNumber,
  exerciseName,
  weightLbs,
  reps,
}: {
  loggedSetId: string;
  setNumber: number;
  exerciseName: string;
  weightLbs: number;
  reps: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState(String(weightLbs));
  const [repsValue, setRepsValue] = useState(String(reps));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const w = Number(weight);
    const r = Number(repsValue);
    if (!weight || !Number.isFinite(w) || w <= 0) {
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
        weightLbs: w,
        reps: r,
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-xs text-muted-foreground underline">
          edit
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit set {setNumber} — {exerciseName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 tabular-nums">
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
