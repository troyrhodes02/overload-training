import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getLoggedWorkoutDetail } from "@/lib/logging/queries";
import { EditSetDialog } from "@/components/logging/edit-set-dialog";
import { EditPlannedSetsDialog } from "@/components/logging/edit-planned-sets-dialog";
import { requireAccount } from "@/lib/data/account";
import { rirSuffix } from "@/lib/logging/rir";

export const metadata = { title: "Workout · Overload" };

export default async function LoggedWorkoutPage({
  params,
}: {
  params: Promise<{ loggedSessionId: string }>;
}) {
  const account = await requireAccount();
  const { loggedSessionId } = await params;
  const detail = await getLoggedWorkoutDetail(account, loggedSessionId);
  if (!detail) notFound();

  return (
    <section className="space-y-3">
      <div>
        <Link
          href="/history"
          className="flex items-center text-sm text-muted-foreground"
        >
          <ChevronLeft className="size-4" /> {detail.sessionName}
        </Link>
        <p className="text-sm text-muted-foreground">
          {detail.dateLabel}
          {detail.gymName ? ` · ${detail.gymName}` : ""}
        </p>
      </div>

      {detail.exercises.map((ex, i) => {
        const workingSets = ex.sets.filter((s) => !s.extra).length;
        const fellShort = ex.sets.length > 0 && workingSets < ex.plannedSets;
        return (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium">
              {/* The exercise's history (Exercise History & PR Intelligence R4). */}
              <Link
                href={ex.historyHref}
                className="text-primary underline-offset-4 hover:underline"
              >
                {ex.performedName}
              </Link>{" "}
              <span className="font-normal text-muted-foreground">
                {ex.swapped
                  ? `(swapped from ${ex.plannedName})`
                  : "(as planned)"}
                {ex.archived ? " · archived" : ""}
              </span>
            </p>
            <div className="mt-2 space-y-1 text-sm tabular-nums">
              {ex.sets.map((s) => (
                <div
                  key={s.loggedSetId}
                  className="flex items-center justify-between"
                >
                  <span>
                    Set {s.setNumber} &nbsp;{" "}
                    {s.weightLbs === null
                      ? `${s.reps} reps`
                      : `${s.weightLbs} lbs × ${s.reps}`}
                    {rirSuffix(s.rir) ? (
                      <span className="text-xs text-muted-foreground">
                        {` ${rirSuffix(s.rir)}`}
                      </span>
                    ) : null}
                    {s.extra ? (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · extra
                      </span>
                    ) : null}
                  </span>
                  <EditSetDialog
                    loggedSetId={s.loggedSetId}
                    setNumber={s.setNumber}
                    exerciseName={ex.performedName}
                    requiresExternalWeight={ex.requiresExternalWeight}
                    weightLbs={s.weightLbs}
                    reps={s.reps}
                    rir={s.rir}
                  />
                </div>
              ))}
              {ex.sets.length === 0 ? (
                <p className="text-xs text-muted-foreground">Not done.</p>
              ) : fellShort ? (
                <div className="flex items-start justify-between gap-3 pt-1">
                  <p className="text-xs text-muted-foreground">
                    {workingSets} of {ex.plannedSets} planned sets — counts
                    toward your strength trend, not your progress check.
                  </p>
                  <EditPlannedSetsDialog
                    loggedExerciseId={ex.loggedExerciseId}
                    exerciseName={ex.performedName}
                    plannedSets={ex.plannedSets}
                    loggedWorkingSets={workingSets}
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
