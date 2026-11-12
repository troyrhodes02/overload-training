"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveGoalAction } from "@/app/(app)/goals/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Manually retire an active goal (design Screen 4; R9, R37, R59). Archiving is
 * soft — the record moves to goal history and training history is untouched —
 * so the confirm is not destructive red. There is NO undo: an archived goal
 * never returns to active; chasing it again is a new goal.
 */
export function ArchiveGoalButton({
  goalId,
  exerciseName,
  targetLabel,
}: {
  goalId: string;
  exerciseName: string;
  targetLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await archiveGoalAction(goalId);
      if (!result.ok) {
        toast.error(result.error.message, { duration: Infinity });
        return;
      }
      setOpen(false);
      toast("Goal archived", { duration: 4000 });
      router.push("/goals");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 w-full md:w-auto">
          Archive goal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this goal?</DialogTitle>
          <DialogDescription>
            {exerciseName} · <span className="tabular-nums">{targetLabel}</span>{" "}
            moves to goal history. Your training history isn&apos;t touched. To
            chase it again, set it as a new goal.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={confirm} disabled={isPending}>
            {isPending ? "Archiving…" : "Archive goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
