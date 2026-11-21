import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { UnfinishedWorkoutDto } from "@overload/shared/contracts/views";
import { formatPlanDate } from "@overload/shared/plan/calendar";
import {
  UNFINISHED_SHOWN,
  unfinishedExplanation,
  unfinishedHeading,
  unfinishedLine,
  unfinishedMore,
} from "@overload/shared/logging/unfinished";

/**
 * Workouts started on an earlier day and never finished (Pitch 21g OVE-228):
 * shown on Today in every state, so one never disappears behind today's plan.
 * One workout is a short card; several are a compact list, each resumable on
 * its own. Not dismissible: it shows exactly while the server says the
 * workout is in progress. Resume opens the ORIGINAL workout, with its own
 * date, gym, and sets.
 */
export function UnfinishedWorkouts({
  workouts,
}: {
  workouts: UnfinishedWorkoutDto[];
}) {
  if (workouts.length === 0) return null;
  return (
    <section
      aria-labelledby="unfinished-heading"
      data-testid="unfinished-workouts"
      className="rounded-lg border border-attention bg-card p-4"
    >
      <h2 id="unfinished-heading" className="font-medium">
        {unfinishedHeading(workouts.length)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {unfinishedExplanation(workouts.length)}
      </p>
      <ul className="mt-3 space-y-2">
        {workouts.slice(0, UNFINISHED_SHOWN).map((w) => (
          <li
            key={w.loggedSessionId}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
          >
            <span className="min-w-0 text-sm tabular-nums">
              {unfinishedLine(w)}
              {w.gymName ? (
                <span className="text-muted-foreground"> · {w.gymName}</span>
              ) : null}
              <span className="text-muted-foreground"> · In progress</span>
            </span>
            <Button asChild variant="secondary" size="sm" className="h-11">
              <Link
                href={`/log/${w.loggedSessionId}`}
                aria-label={`Resume ${w.sessionName} from ${formatPlanDate(w.scheduledFor)}`}
              >
                Resume
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      {unfinishedMore(workouts.length) ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {unfinishedMore(workouts.length)}{" "}
          <Link href="/history" className="underline">
            History →
          </Link>
        </p>
      ) : null}
    </section>
  );
}
