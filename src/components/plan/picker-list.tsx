"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { replaceSessionExerciseAction } from "@/app/(app)/plan/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExerciseThumb } from "@/components/exercises/exercise-thumb";
import { PlannedExerciseDialog } from "@/components/plan/planned-exercise-dialog";
import type { ExerciseListItemDto } from "@/lib/exercises/queries";

export type ReplaceTarget = {
  id: string;
  exerciseName: string;
  prescription: string; // "3 × 12–15"
};

/**
 * Library results inside the session builder. The rows are the library's own
 * (active exercises only); an exercise already in this session is shown as
 * "In session" and can't be chosen again (spec D20). Choosing a row either
 * opens the sets/reps dialog (add) or asks before replacing (replace mode).
 */
export function PickerList({
  mesocycleId,
  sessionId,
  items,
  inSessionIds,
  replace,
}: {
  mesocycleId: string;
  sessionId: string;
  items: ExerciseListItemDto[];
  inSessionIds: string[];
  replace: ReplaceTarget | null;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<ExerciseListItemDto | null>(null);
  const [isPending, startTransition] = useTransition();
  const sessionHref = `/plan/${mesocycleId}/sessions/${sessionId}`;
  const taken = new Set(inSessionIds);

  function confirmReplace() {
    if (!replace || !chosen) return;
    startTransition(async () => {
      const result = await replaceSessionExerciseAction({
        sessionExerciseId: replace.id,
        exerciseId: chosen.id,
      });
      if (!result.ok) {
        toast.error(result.error.message, { duration: Infinity });
        return;
      }
      toast.success(`${replace.exerciseName} replaced with ${chosen.name}`, {
        duration: 4000,
      });
      setChosen(null);
      router.push(sessionHref);
    });
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((e) => {
          const inSession = taken.has(e.id);
          return (
            <li key={e.id}>
              <button
                type="button"
                disabled={inSession}
                aria-disabled={inSession}
                onClick={() => setChosen(e)}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
              >
                <ExerciseThumb name={e.name} imageUrl={e.imageUrl} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{e.name}</span>
                    {e.isCustom && (
                      <Badge variant="outline" className="shrink-0">
                        Custom
                      </Badge>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {e.primaryMuscleLabel} · {e.equipmentLabel}
                  </span>
                </span>
                {inSession ? (
                  <Badge variant="secondary">In session</Badge>
                ) : (
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {chosen && !replace && (
        <PlannedExerciseDialog
          key={chosen.id}
          open
          onOpenChange={(open) => !open && setChosen(null)}
          exercise={{
            name: chosen.name,
            primaryMuscleLabel: chosen.primaryMuscleLabel,
            equipmentLabel: chosen.equipmentLabel,
          }}
          mode={{
            kind: "add",
            sessionId,
            exerciseId: chosen.id,
            onAdded: () => router.push(sessionHref),
          }}
        />
      )}

      {replace && (
        <AlertDialog
          open={chosen !== null}
          onOpenChange={(open) => !open && setChosen(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader className="text-left">
              <AlertDialogTitle>
                Replace {replace.exerciseName} with {chosen?.name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Sets and reps stay {replace.prescription}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <Button onClick={confirmReplace} disabled={isPending}>
                {isPending ? "Replacing…" : "Replace"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
