import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { BackLink, MetaLine, StickyActions } from "@/components/plan/plan-bits";
import { PlannedExerciseList } from "@/components/plan/planned-exercise-list";
import {
  PlannedExerciseRowContent,
  plannedRowClass,
} from "@/components/plan/planned-exercise-row";
import {
  RenameSessionButton,
  SessionActionsMenu,
} from "@/components/plan/session-controls";
import { dayName } from "@/lib/plan/calendar";
import { getSessionDetail } from "@/lib/plan/queries";

export const metadata = { title: "Session · Overload" };

type PageProps = {
  params: Promise<{ mesocycleId: string; sessionId: string }>;
};

export default async function SessionPage({ params }: PageProps) {
  const { mesocycleId, sessionId } = await params;
  const s = await getSessionDetail(mesocycleId, sessionId);
  if (!s) notFound();

  const readOnly = s.mesocycle.status === "archived";
  const count = s.exercises.length;
  const dayLine = `${s.dayOfWeek === null ? "Not on the schedule" : dayName(s.dayOfWeek)} · ${
    count === 0
      ? "no exercises"
      : `${count} ${count === 1 ? "exercise" : "exercises"}`
  }`;
  const addHref = `/plan/${s.mesocycle.id}/sessions/${s.id}/add`;

  return (
    <section className="space-y-4 pb-24 md:pb-0">
      <BackLink href={`/plan/${s.mesocycle.id}`} label={s.mesocycle.name} />
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {s.name}
          </h1>
          {!readOnly && (
            <>
              <RenameSessionButton sessionId={s.id} name={s.name} />
              <SessionActionsMenu
                mesocycleId={s.mesocycle.id}
                session={{
                  id: s.id,
                  name: s.name,
                  dayOfWeek: s.dayOfWeek,
                  exerciseCount: count,
                }}
                occupancy={s.occupancy}
                variant="header"
              />
            </>
          )}
        </div>
        {(readOnly || count === 0) && <MetaLine>{dayLine}</MetaLine>}
      </div>

      {count === 0 ? (
        <EmptyState
          title="No exercises yet. Add the first one."
          action={
            readOnly ? undefined : (
              <Button asChild variant="outline">
                <Link href={addHref}>Add exercise</Link>
              </Button>
            )
          }
        />
      ) : readOnly ? (
        // Archived block: rows are not buttons.
        <ol className="divide-y divide-border rounded-lg border border-border bg-card">
          {s.exercises.map((e) => (
            <li key={e.id} id={`slot-${e.id}`} className={plannedRowClass(e)}>
              <div className="flex min-h-16 items-center gap-3 px-3 py-2">
                <PlannedExerciseRowContent e={e} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <PlannedExerciseList
          mesocycleId={s.mesocycle.id}
          sessionId={s.id}
          sessionName={s.name}
          dayLine={dayLine}
          exercises={s.exercises}
        />
      )}

      {!readOnly && (
        <StickyActions>
          <Button asChild className="h-11 w-full">
            <Link href={addHref}>
              <Plus aria-hidden />
              Add exercise
            </Link>
          </Button>
        </StickyActions>
      )}
    </section>
  );
}
