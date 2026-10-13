import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  countActiveGoals,
  listActiveGoals,
  listUnacknowledgedCompletions,
} from "@/lib/goals/queries";
import { GoalList } from "./goal-list";
import { GoalReachedCard } from "./goal-reached-card";

/** How many active goals the dashboard surfaces before "All goals" (R64). */
export const DASHBOARD_GOAL_LIMIT = 3;

/**
 * Goals on the dashboard's alternate state (design Screen 7; R42, R43). The
 * caller renders this ONLY when no training action is pending (day complete,
 * rest day, no plan) — a pending or in-progress workout and the missed-day
 * prompt never share the screen with goal content. Concise: unacknowledged
 * "Goal reached" cards, then at most three active goals.
 */
export async function DashboardGoals() {
  const [reached, goals, total] = await Promise.all([
    listUnacknowledgedCompletions(),
    listActiveGoals({ take: DASHBOARD_GOAL_LIMIT }),
    countActiveGoals(),
  ]);

  return (
    <div className="space-y-4">
      {reached.map((r) => (
        <GoalReachedCard
          key={r.goalId}
          goalId={r.goalId}
          exerciseName={r.exerciseName}
          gymName={r.gymName}
          targetLabel={r.targetLabel}
          alreadyReached={r.alreadyReached}
          newGoalHref={r.newGoalHref}
        />
      ))}

      {goals.length === 0 ? (
        <Link
          href="/goals/new"
          className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          No active goals. Set one
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <section aria-labelledby="dashboard-goals" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="dashboard-goals" className="text-sm font-medium">
              Goals
            </h2>
            <Link
              href="/goals"
              className="flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {total > goals.length ? `All goals (${total})` : "All goals"}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </div>
          <GoalList goals={goals} compact />
        </section>
      )}
    </div>
  );
}
