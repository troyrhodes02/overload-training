"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";
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

export const ARCHIVED_MESSAGE = "Archived. Past workouts keep it.";

/**
 * Shared archive confirmation (design doc §8, spec D30). Archiving is soft —
 * nothing is deleted — so the confirm button is not destructive red. Because
 * there is no archived-items screen in this pitch, the lifter gets a short,
 * specific confirmation AND an immediate Undo in the toast.
 */
export function ArchiveDialog({
  trigger,
  name,
  body,
  archive,
  restore,
  onArchived,
}: {
  trigger: ReactNode;
  name: string;
  body: string;
  archive: () => Promise<ActionResult<unknown>>;
  restore: () => Promise<ActionResult<unknown>>;
  /** Called after a successful archive (e.g. navigate away from a detail page). */
  onArchived?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await archive();
      if (!result.ok) {
        toast.error(result.error.message, { duration: Infinity });
        return;
      }
      setOpen(false);
      onArchived?.();
      toast(ARCHIVED_MESSAGE, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: async () => {
            const undone = await restore();
            if (undone.ok) toast.success("Restored", { duration: 3000 });
            else toast.error(undone.error.message, { duration: Infinity });
          },
        },
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {name}?</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
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
            {isPending ? "Archiving…" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
