import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { ExerciseThumb } from "@/components/exercises/exercise-thumb";
import { GoalTargetForm } from "@/components/goals/goal-target-form";
import { BackLink } from "@/components/plan/plan-bits";
import { getGoalFormContext } from "@/lib/goals/queries";

export const metadata = { title: "New goal · Overload" };

type PageProps = {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * New goal — the target form (design Screen 3). The form only exists for an
 * active exercise with no active goal; every other case says plainly why
 * (duplicate, no gyms for a machine goal, archived exercise). `?gymId=`
 * preselects the gym ("Set a new goal"); the numbers always start blank.
 */
export default async function NewGoalTargetPage({
  params,
  searchParams,
}: PageProps) {
  const [{ exerciseId }, sp] = await Promise.all([params, searchParams]);
  const gymParam = Array.isArray(sp.gymId) ? sp.gymId[0] : sp.gymId;
  const ctx = await getGoalFormContext(exerciseId, gymParam ?? null);
  if (ctx.kind === "not_found") notFound();

  if (ctx.kind === "archived_exercise") {
    return (
      <section className="space-y-4">
        <BackLink href="/goals" label="Goals" />
        <EmptyState
          title={`${ctx.exerciseName} is archived.`}
          description="Goals can only be set for active exercises."
          action={
            <Button asChild variant="outline">
              <Link href="/goals/new">Pick another lift</Link>
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-24 md:pb-0">
      <div className="space-y-1">
        <BackLink href="/goals/new" label="Pick another lift" />
        <h1 className="text-lg font-semibold">New goal</h1>
      </div>

      {ctx.kind === "duplicate" ? (
        <>
          <p className="text-sm font-medium">{ctx.exerciseName}</p>
          <Alert>
            <AlertDescription className="space-y-3">
              <p>
                {ctx.exerciseName} already has an active goal
                {ctx.existing.gymName
                  ? ` at ${ctx.existing.gymName}`
                  : ""}:{" "}
                <span className="font-medium tabular-nums">
                  {ctx.existing.targetLabel}
                </span>
                {ctx.existing.percent != null ? (
                  <span className="tabular-nums">
                    {" "}
                    ({ctx.existing.percent}%)
                  </span>
                ) : null}
                .{" "}
                {ctx.existing.gymName
                  ? "Archive it to set one at another gym."
                  : "Archive it to set a different one."}
              </p>
              <Button asChild variant="outline" className="h-11">
                <Link href={`/goals/${ctx.existing.goalId}`}>View goal</Link>
              </Button>
            </AlertDescription>
          </Alert>
        </>
      ) : ctx.kind === "no_gyms" ? (
        <>
          <div>
            <p className="text-sm font-medium">{ctx.exerciseName}</p>
            <p className="text-xs text-muted-foreground">{ctx.exerciseMeta}</p>
          </div>
          <Alert>
            <AlertDescription className="space-y-3">
              <p>Add a gym first — machine goals are measured at one gym.</p>
              <Button asChild variant="outline" className="h-11">
                <Link href="/gyms/new">Add gym</Link>
              </Button>
            </AlertDescription>
          </Alert>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <ExerciseThumb
              name={ctx.exercise.name}
              imageUrl={ctx.exercise.imageUrl}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {ctx.exercise.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {ctx.exercise.meta}
              </p>
            </div>
          </div>
          <GoalTargetForm
            exerciseId={ctx.exercise.id}
            gymVariable={ctx.gymVariable}
            gyms={ctx.gyms}
            defaultGymId={ctx.defaultGymId}
          />
        </>
      )}
    </section>
  );
}
