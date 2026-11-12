import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ActiveGoalDto } from "@/lib/goals/queries";
import { cn } from "@/lib/utils";
import { GoalProgressBar } from "./goal-progress-bar";

/** "Barbell Bench Press, 315 pounds by 1, 87 percent" — the row's accessible name. */
function rowLabel(g: ActiveGoalDto): string {
  const target = `${g.targetWeightLbs} pounds by ${g.targetReps}`;
  const where = g.gymName ? ` at ${g.gymName}` : "";
  const measured =
    g.percent == null ? "no performance recorded yet" : `${g.percent} percent`;
  return `${g.exerciseName}${where}, ${target}, ${measured}`;
}

/**
 * Active goals as calm progress rows (design Screen 1 / Screen 7). Each row:
 * exercise, gym (machine/cable only), target, and either a floored percentage
 * with an accent bar or "No performance recorded yet" — never 0%. Archived
 * exercise/gym context is marked, never hidden. All numbers arrive derived in
 * the DTO; no goal math happens here.
 */
export function GoalList({
  goals,
  compact = false,
}: {
  goals: ActiveGoalDto[];
  compact?: boolean;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {goals.map((g) => (
        <li key={g.goalId}>
          <Link
            href={`/goals/${g.goalId}`}
            aria-label={rowLabel(g)}
            className={cn(
              "flex items-center gap-4 hover:bg-muted/40",
              compact ? "p-3" : "min-h-16 p-4",
            )}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{g.exerciseName}</span>
                {g.exerciseArchived ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Exercise archived
                  </Badge>
                ) : null}
              </p>
              {g.gymName ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  {g.gymName}
                  {g.gymArchived ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Gym archived
                    </Badge>
                  ) : null}
                </p>
              ) : null}
              <p className="text-base font-medium tabular-nums">
                {g.targetLabel}
              </p>
              {g.percent == null ? (
                <p className="text-sm text-muted-foreground">
                  No performance recorded yet
                </p>
              ) : (
                <GoalProgressBar percent={g.percent} />
              )}
            </div>
            {g.percent != null ? (
              <span className="text-2xl font-semibold tabular-nums tracking-tight">
                {g.percent}%
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
