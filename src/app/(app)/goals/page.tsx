import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { GoalList } from "@/components/goals/goal-list";
import { GoalReachedCard } from "@/components/goals/goal-reached-card";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";
import {
  countGoalHistory,
  listActiveGoals,
  listUnacknowledgedCompletions,
} from "@/lib/goals/queries";
import { requireAccount } from "@/lib/data/account";

export const metadata = { title: "Goals · Overload" };

/**
 * Goals overview (design Screen 1): every target being pursued and how close,
 * nothing else. Completion is reconciled first (spec §11b, R54), so a goal the
 * history has met appears as its one-time "Goal reached" card — never as an
 * active 100% row. Percentages are derived on this read; the list keeps the
 * order the goals were set in (R64). History is one quiet link below.
 */
export default async function GoalsPage() {
  const account = await requireAccount();
  // Request-time only: reconciliation may write a completion, which must
  // never happen during a build-time prerender (and reads the clock).
  await connection();
  await reconcileGoalCompletionsSafely(account);
  const [reached, goals, historyCount] = await Promise.all([
    listUnacknowledgedCompletions(account),
    listActiveGoals(account),
    countGoalHistory(account),
  ]);

  return (
    <section className="space-y-4 pb-20 md:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Goals</h1>
        <Button asChild variant="outline" className="hidden md:inline-flex">
          <Link href="/goals/new">
            <Plus aria-hidden />
            New goal
          </Link>
        </Button>
      </div>

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
        <EmptyState
          title="No goals yet."
          description="Set a weight × reps target for a lift to track it here."
        />
      ) : (
        <GoalList goals={goals} />
      )}

      {historyCount > 0 ? (
        <Link
          href="/goals/history"
          className="flex min-h-11 items-center justify-between rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <span className="tabular-nums">Goal history ({historyCount})</span>
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : null}

      {/* Thumb-reach primary action on phones, at the bottom edge. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <Button asChild className="h-11 w-full">
          <Link href="/goals/new">
            <Plus aria-hidden />
            New goal
          </Link>
        </Button>
      </div>
    </section>
  );
}
