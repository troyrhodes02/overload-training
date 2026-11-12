"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { moveSessionExerciseAction } from "@/app/(app)/plan/actions";
import { Button } from "@/components/ui/button";
import { PlannedExerciseDialog } from "@/components/plan/planned-exercise-dialog";
import {
  PlannedExerciseRowContent,
  plannedRowClass,
} from "@/components/plan/planned-exercise-row";
import type { PlannedExerciseDto } from "@/lib/plan/queries";
import { cn } from "@/lib/utils";

/**
 * The session's planned exercises in the lifter's order. Tap a row to edit
 * its sets and rep range (or replace / remove it). Reorder mode swaps rows
 * with explicit up/down buttons — no drag (spec D52). A slot linked from the
 * readiness checklist (#slot-<id>) is scrolled into view and ringed.
 */
export function PlannedExerciseList({
  mesocycleId,
  sessionId,
  sessionName,
  dayLine,
  exercises,
}: {
  mesocycleId: string;
  sessionId: string;
  sessionName: string;
  /** "Monday · 4 exercises", shown beside the Reorder toggle. */
  dayLine: string;
  exercises: PlannedExerciseDto[];
}) {
  const [reorder, setReorder] = useState(false);
  const [editing, setEditing] = useState<PlannedExerciseDto | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const id = window.location.hash.replace(/^#slot-/, "");
    if (!id || id === window.location.hash) return;
    const el = document.getElementById(`slot-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    // A one-off visual cue for an element that exists only after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlight(id);
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(t);
  }, []);

  function move(e: PlannedExerciseDto, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveSessionExerciseAction({
        sessionExerciseId: e.id,
        direction,
      });
      if (!result.ok) toast.error(result.error.message, { duration: Infinity });
      // Keep focus on the same control of the moved row.
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLButtonElement>(
            `[data-move="${e.id}-${direction}"]`,
          )
          ?.focus(),
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">{dayLine}</p>
        {exercises.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReorder((r) => !r)}
          >
            {reorder ? "Done" : "Reorder"}
          </Button>
        )}
      </div>

      <ol className="divide-y divide-border rounded-lg border border-border bg-card">
        {exercises.map((e, i) =>
          reorder ? (
            <li
              key={e.id}
              className="flex min-h-14 items-center gap-2 pr-1 pl-4"
            >
              <span className="w-5 text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {e.exerciseName}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                data-move={`${e.id}-up`}
                disabled={i === 0 || isPending}
                aria-label={`Move ${e.exerciseName} up`}
                onClick={() => move(e, "up")}
              >
                <ArrowUp className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                data-move={`${e.id}-down`}
                disabled={i === exercises.length - 1 || isPending}
                aria-label={`Move ${e.exerciseName} down`}
                onClick={() => move(e, "down")}
              >
                <ArrowDown className="size-5" />
              </Button>
            </li>
          ) : (
            <li
              key={e.id}
              id={`slot-${e.id}`}
              className={cn(
                plannedRowClass(e),
                highlight === e.id && "ring-2 ring-ring",
              )}
            >
              <button
                type="button"
                onClick={() => setEditing(e)}
                className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Edit ${e.exerciseName}`}
              >
                <PlannedExerciseRowContent e={e} />
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </button>
            </li>
          ),
        )}
      </ol>

      {editing && (
        <PlannedExerciseDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          exercise={{
            name: editing.exerciseName,
            primaryMuscleLabel: editing.primaryMuscleLabel,
            equipmentLabel: editing.equipmentLabel,
            isArchived: editing.isArchived,
          }}
          mode={{
            kind: "edit",
            sessionExerciseId: editing.id,
            sessionName,
            replaceHref: `/plan/${mesocycleId}/sessions/${sessionId}/add?replace=${editing.id}`,
            plannedSets: editing.plannedSets,
            targetRepMin: editing.targetRepMin,
            targetRepMax: editing.targetRepMax,
          }}
        />
      )}
    </div>
  );
}
