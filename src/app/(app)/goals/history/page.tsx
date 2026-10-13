import Link from "next/link";
import { connection } from "next/server";
import { Archive, CircleCheck } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { BackLink } from "@/components/plan/plan-bits";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";
import { listGoalHistory } from "@/lib/goals/queries";

export const metadata = { title: "Goal history · Overload" };

/**
 * Goal history (design Screen 5; R46, R47): reached and manually archived
 * goals, most recently archived first, secondary to the active list. Archived
 * exercises and gyms are named and marked — never hidden. Outcomes use muted
 * icons and text only (no status color).
 */
export default async function GoalHistoryPage() {
  // Request-time only: reconciliation may write a completion, which must
  // never happen during a build-time prerender (and reads the clock).
  await connection();
  await reconcileGoalCompletionsSafely();
  const history = await listGoalHistory();

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <BackLink href="/goals" label="Goals" />
        <h1 className="text-lg font-semibold">Goal history</h1>
      </div>

      {history.length === 0 ? (
        <EmptyState
          title="No goal history yet."
          description="Reached and archived goals appear here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {history.map((g) => (
            <li key={g.goalId}>
              <Link
                href={`/goals/${g.goalId}`}
                className="block min-h-16 space-y-1 p-4 hover:bg-muted/40"
              >
                <p className="text-sm font-medium">
                  {g.exerciseName}
                  {g.exerciseArchived ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      (archived)
                    </span>
                  ) : null}
                </p>
                {g.gymName ? (
                  <p className="text-xs text-muted-foreground">
                    {g.gymName}
                    {g.gymArchived ? " (archived)" : ""}
                  </p>
                ) : null}
                <p className="text-base font-medium tabular-nums">
                  {g.targetLabel}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                  {g.outcome === "completed" ? (
                    <>
                      <CircleCheck aria-hidden className="size-3.5" />
                      Reached {g.archivedLabel}
                    </>
                  ) : (
                    <>
                      <Archive aria-hidden className="size-3.5" />
                      Archived {g.archivedLabel}
                    </>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
