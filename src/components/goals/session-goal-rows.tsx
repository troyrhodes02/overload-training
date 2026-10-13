import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { getSessionGoalSummary } from "@/lib/goals/queries";

/**
 * The goals a completed workout actually moved (design Screen 8; R44, R45).
 * Only goals this session contributed a qualifying performance to appear —
 * the performed exercise, and for a machine goal, at its gym. Nothing renders
 * when the workout touched no goal. Percentages are independent of the
 * progression tags shown above them.
 */
export async function SessionGoalRows({
  loggedSessionId,
}: {
  loggedSessionId: string;
}) {
  const rows = await getSessionGoalSummary(loggedSessionId);
  if (rows.length === 0) return null;

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">Goals</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.goalId}>
            <Link
              href={`/goals/${r.goalId}`}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {r.exerciseName}{" "}
                <span className="text-muted-foreground tabular-nums">
                  · {r.targetLabel}
                </span>
              </span>
              {r.kind === "reached" ? (
                <span className="flex shrink-0 items-center gap-1 text-primary">
                  <CircleCheck aria-hidden className="size-4" />
                  Goal reached
                </span>
              ) : r.percentAfter == null ? null : (
                <span className="shrink-0 tabular-nums">
                  {r.percentBefore != null &&
                  r.percentBefore !== r.percentAfter ? (
                    <span className="text-muted-foreground">
                      {r.percentBefore}% →{" "}
                    </span>
                  ) : null}
                  <span className="font-medium">{r.percentAfter}%</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
