import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExerciseThumb } from "@/components/exercises/exercise-thumb";
import type { ExerciseListItemDto } from "@/lib/exercises/queries";

/**
 * Library results for "New goal — pick the lift" (design Screen 2). Rows are
 * the library's own (active exercises only; imported and custom alike). An
 * exercise that already has an active goal is marked and links to THAT goal —
 * a second active goal is never offered (R6).
 */
export function GoalExercisePicker({
  items,
  activeGoalByExercise,
}: {
  items: ExerciseListItemDto[];
  activeGoalByExercise: Map<string, string>;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((e) => {
        const goalId = activeGoalByExercise.get(e.id);
        return (
          <li key={e.id}>
            <Link
              href={goalId ? `/goals/${goalId}` : `/goals/new/${e.id}`}
              className="flex min-h-16 w-full items-center gap-3 px-3 py-2 hover:bg-muted/40"
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
              {goalId ? (
                <Badge variant="secondary">Active goal</Badge>
              ) : (
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
