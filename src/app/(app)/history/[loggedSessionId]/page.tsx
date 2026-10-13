import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getLoggedWorkoutDetail } from "@/lib/logging/queries";
import { EditSetDialog } from "@/components/logging/edit-set-dialog";

export const metadata = { title: "Workout · Overload" };

export default async function LoggedWorkoutPage({
  params,
}: {
  params: Promise<{ loggedSessionId: string }>;
}) {
  const { loggedSessionId } = await params;
  const detail = await getLoggedWorkoutDetail(loggedSessionId);
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

      {detail.exercises.map((ex, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">
            {ex.performedName}{" "}
            <span className="font-normal text-muted-foreground">
              {ex.swapped ? `(swapped from ${ex.plannedName})` : "(as planned)"}
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
                  Set {s.setNumber} &nbsp; {s.weightLbs} lbs × {s.reps}
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
                  weightLbs={s.weightLbs}
                  reps={s.reps}
                />
              </div>
            ))}
            {ex.sets.length === 0 ? (
              <p className="text-xs text-muted-foreground">Not done.</p>
            ) : ex.sets.filter((s) => !s.extra).length < ex.plannedSets ? (
              <p className="text-xs text-muted-foreground">
                {ex.sets.filter((s) => !s.extra).length} of {ex.plannedSets}{" "}
                planned sets — doesn&apos;t count toward progression.
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
