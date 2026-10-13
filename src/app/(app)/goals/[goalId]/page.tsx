import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CreatedToast } from "@/components/feedback/created-toast";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { BackLink } from "@/components/plan/plan-bits";
import { getGoalDetail, type GoalDetailDto } from "@/lib/goals/queries";

export const metadata = { title: "Goal · Overload" };

type PageProps = {
  params: Promise<{ goalId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Goal detail (design Screen 4): the target, one floored percentage, and the
 * best qualifying session behind it — all derived on this read. An archived
 * goal shows its lifecycle outcome and NO re-derived percentage (R60).
 */
export default async function GoalDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ goalId }, sp] = await Promise.all([params, searchParams]);
  const goal = await getGoalDetail(goalId);
  if (!goal) notFound();

  return (
    <section className="space-y-6 pb-24 md:pb-0">
      <CreatedToast show={sp.created === "1"} message="Goal set" />
      {goal.kind === "active" ? (
        <ActiveGoal goal={goal} />
      ) : (
        <ArchivedGoal goal={goal} />
      )}
    </section>
  );
}

function trendHref(goal: GoalDetailDto): string {
  return `/exercises/${goal.exerciseId}${goal.gymId ? `?gym=${goal.gymId}` : ""}`;
}

function Heading({ goal }: { goal: GoalDetailDto }) {
  return (
    <div className="space-y-1">
      <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
        {goal.exerciseName}
        {goal.exerciseArchived ? (
          <Badge variant="outline" className="text-muted-foreground">
            Exercise archived
          </Badge>
        ) : null}
      </h1>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {goal.gymName ? (
          <>
            <span>{goal.gymName}</span>
            {goal.gymArchived ? (
              <Badge variant="outline" className="text-muted-foreground">
                Gym archived
              </Badge>
            ) : null}
            <span aria-hidden>·</span>
          </>
        ) : (
          <span>Goal ·</span>
        )}
        <span>set {goal.createdLabel}</span>
      </p>
    </div>
  );
}

function ActiveGoal({
  goal,
}: {
  goal: Extract<GoalDetailDto, { kind: "active" }>;
}) {
  return (
    <>
      <BackLink href="/goals" label="Goals" />
      <Heading goal={goal} />

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {goal.targetLabel}
          </p>
          {goal.percent != null ? (
            <p className="text-4xl font-semibold tabular-nums tracking-tight">
              {goal.percent}%
            </p>
          ) : null}
        </div>
        {goal.percent != null ? (
          <GoalProgressBar percent={goal.percent} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No performance recorded yet
            {goal.gymName ? ` at ${goal.gymName}` : ""}.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-sm tabular-nums">
        {goal.best ? (
          <>
            <dt className="text-muted-foreground">Best</dt>
            <dd>
              {goal.best.e1rm} lb e1RM
              <span className="block text-xs text-muted-foreground">
                from {goal.best.weightLbs} × {goal.best.reps} ·{" "}
                {goal.best.dateLabel}
              </span>
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Target</dt>
        <dd>{goal.targetE1rm} lb e1RM</dd>
      </dl>

      {goal.exerciseArchived ? (
        <Alert>
          <AlertDescription>
            This exercise is archived, so new sessions won&apos;t add to this
            goal. Archive the goal when you&apos;re done with it.
          </AlertDescription>
        </Alert>
      ) : goal.gymArchived ? (
        <Alert>
          <AlertDescription>
            {goal.gymName} is archived. This goal stays measured there; archive
            it when you&apos;re done with it.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          {goal.gymName
            ? `Only sessions at ${goal.gymName} count toward this goal.`
            : "Best session across all gyms."}{" "}
          Epley estimate, same as the trend.
        </p>
        <Link href={trendHref(goal)} className="text-sm text-primary">
          e1RM trend ›
        </Link>
      </div>
    </>
  );
}

function ArchivedGoal({
  goal,
}: {
  goal: Extract<GoalDetailDto, { kind: "archived" }>;
}) {
  return (
    <>
      <BackLink href="/goals" label="Goals" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">
          {goal.exerciseName}
          {goal.exerciseArchived ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              (archived)
            </span>
          ) : null}
        </h1>
        {goal.gymName ? (
          <p className="text-sm text-muted-foreground">
            {goal.gymName}
            {goal.gymArchived ? " (archived)" : ""}
          </p>
        ) : null}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
          {goal.outcome === "completed" ? (
            <>
              <CircleCheck aria-hidden className="size-4" /> Reached{" "}
              {goal.archivedLabel}
            </>
          ) : (
            <>
              <Archive aria-hidden className="size-4" /> Archived{" "}
              {goal.archivedLabel}
            </>
          )}
        </p>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">
        {goal.targetLabel}
      </p>
      <p className="text-sm text-muted-foreground">Set {goal.createdLabel}</p>
      <div className="border-t border-border pt-3">
        <Link href={trendHref(goal)} className="text-sm text-primary">
          e1RM trend ›
        </Link>
      </div>
    </>
  );
}
