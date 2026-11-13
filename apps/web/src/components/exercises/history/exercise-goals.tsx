import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import type { ExerciseGoalsDto } from "@/lib/goals/queries";

/**
 * The goals set on this lift (design doc §4.7; preview §01, §05): the active
 * goal with the Goals page's own percent and best, then past goals, newest
 * first. Every goal is listed whatever gym the page shows; a machine goal
 * names its gym, because each goal is already measured at its own gym only
 * (R17). Rows open the existing goal pages; nothing here changes a goal.
 */
export function ExerciseGoals({
  goals,
  newGoalHref,
}: {
  goals: ExerciseGoalsDto;
  /** The existing goal form for this lift, when one may be set (R19). */
  newGoalHref: string | null;
}) {
  const at = (gymName: string | null) =>
    gymName ? (
      <span className="text-muted-foreground"> at {gymName}</span>
    ) : null;

  return (
    <section aria-labelledby="goals-heading" className="space-y-2">
      <h2 id="goals-heading" className="text-base font-medium">
        Goals
      </h2>
      {goals.bodyweight ? (
        <p className="text-sm text-muted-foreground">
          Goals use a weight × reps target, so reps-only lifts don&apos;t have
          them.
        </p>
      ) : (
        <>
          {goals.active ? (
            <Link
              href={`/goals/${goals.active.goalId}`}
              className="flex min-h-11 items-center gap-2 text-sm tabular-nums"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span>
                    {goals.active.targetLabel}
                    {at(goals.active.gymName)}
                  </span>
                  {goals.active.percent !== null ? (
                    <span className="font-medium">{goals.active.percent}%</span>
                  ) : null}
                </div>
                {goals.active.percent !== null ? (
                  <GoalProgressBar percent={goals.active.percent} />
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {goals.active.best
                    ? `Best ${goals.active.best.weightLbs} × ${goals.active.best.reps} · ${goals.active.best.dateLabel}`
                    : "No performance recorded yet"}
                </span>
              </div>
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              No goal on this lift.
              {newGoalHref ? (
                <>
                  {" "}
                  <Link href={newGoalHref} className="text-primary">
                    Set a goal
                  </Link>
                </>
              ) : null}
            </p>
          )}
          {goals.past.length > 0 ? (
            <div className="space-y-1">
              <p className="pt-1 text-xs text-muted-foreground">Past</p>
              <ul className="divide-y divide-border">
                {goals.past.map((g) => (
                  <li key={g.goalId}>
                    <Link
                      href={`/goals/${g.goalId}`}
                      className="flex min-h-11 items-center gap-2 text-sm tabular-nums"
                    >
                      <span className="min-w-0 flex-1">
                        {g.targetLabel}
                        {at(g.gymName)}
                        <span className="text-muted-foreground">
                          {" "}
                          · {g.outcome === "completed"
                            ? "Reached"
                            : "Archived"}{" "}
                          {g.archivedLabel}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
