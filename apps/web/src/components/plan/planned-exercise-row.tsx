import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExerciseThumb } from "@/components/exercises/exercise-thumb";
import type { PlannedExerciseDto } from "@/lib/plan/queries";
import { formatPrescription } from "@overload/shared/plan/rep-target";

/**
 * The body of a planned-exercise row. An archived exercise keeps its slot,
 * marked (dashed border on the row, attention tile, Archived badge), until
 * the lifter replaces or removes it — never substituted (spec D29, D36).
 */
export function PlannedExerciseRowContent({ e }: { e: PlannedExerciseDto }) {
  return (
    <>
      {e.isArchived ? (
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted text-foreground"
        >
          <TriangleAlert className="size-5" />
        </span>
      ) : (
        <ExerciseThumb name={e.exerciseName} imageUrl={e.imageUrl} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{e.exerciseName}</span>
          {e.isArchived && (
            <Badge variant="outline" className="shrink-0">
              Archived
            </Badge>
          )}
          {e.isCustom && !e.isArchived && (
            <Badge variant="outline" className="shrink-0">
              Custom
            </Badge>
          )}
        </span>
        <span className="block text-sm tabular-nums">
          {formatPrescription(e)}
        </span>
        {e.isArchived && (
          <span className="block text-xs text-muted-foreground">
            Replace or remove it
          </span>
        )}
      </span>
    </>
  );
}

/** Row frame classes; archived slots get a dashed top/bottom border. */
export function plannedRowClass(e: PlannedExerciseDto): string {
  return e.isArchived ? "border-y border-dashed border-border" : "";
}
