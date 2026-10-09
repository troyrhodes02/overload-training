import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/plan/plan-bits";
import { MesocycleForm } from "@/components/plan/mesocycle-form";
import { formatPlanDate } from "@/lib/plan/calendar";
import { getCloneSetup } from "@/lib/plan/queries";
import { cloneMesocycleAction } from "../../actions";

export const metadata = { title: "Clone setup · Overload" };

type PageProps = { params: Promise<{ sourceId: string }> };

const MAX_LISTED = 5;

/**
 * Confirm the new block's name and dates and see what comes across before the
 * clone is created as a draft (spec D30–D36). Defaults: "<name> Copy", the day
 * after the source ends, the same length and deload week — all editable.
 */
export default async function CloneSetupPage({ params }: PageProps) {
  const { sourceId } = await params;
  const setup = await getCloneSetup(sourceId);

  if (!setup) {
    return (
      <section className="space-y-4">
        <BackLink href="/plan/clone" label="Clone a mesocycle" />
        <p className="font-medium">That mesocycle can&apos;t be cloned.</p>
        <Button asChild variant="outline">
          <Link href="/plan/clone">Choose another</Link>
        </Button>
      </section>
    );
  }

  const { source, defaults, archivedReferences } = setup;
  const sessions = `${source.sessionCount} ${source.sessionCount === 1 ? "session" : "sessions"}`;
  const exercises = `${setup.exerciseCount} ${setup.exerciseCount === 1 ? "exercise" : "exercises"}`;

  return (
    <section className="space-y-6 pb-24 md:pb-0">
      <div className="space-y-1">
        <BackLink href="/plan/clone" label="Clone a mesocycle" />
        <h1 className="text-lg font-semibold">Clone {source.name}</h1>
      </div>

      <MesocycleForm
        action={cloneMesocycleAction.bind(null, source.id)}
        variant="clone"
        submitLabel="Create draft"
        pendingLabel="Creating…"
        startHelp={
          source.endDate
            ? `The day after ${source.name} ends (${formatPlanDate(source.endDate)}).`
            : "Week 1 begins on this date."
        }
        initial={{
          name: defaults.name,
          startDate: defaults.startDate ?? "",
          lengthWeeks: String(defaults.lengthWeeks),
          deloadWeek: String(defaults.deloadWeek),
          splitType: source.splitType,
        }}
      >
        <div className="space-y-2">
          <h2 className="text-sm font-medium">What comes across</h2>
          <div className="space-y-1 rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-medium">{source.splitLabel}</p>
            <p className="tabular-nums">
              {sessions} · {exercises}
            </p>
            <p className="text-muted-foreground">
              Days, order, sets, and rep ranges, ready to edit.
            </p>
            <p className="text-muted-foreground">
              Workout history, goals, and gym weights are not copied.
            </p>
          </div>
        </div>

        {archivedReferences.length > 0 && (
          <Alert>
            <TriangleAlert aria-hidden />
            <AlertTitle>
              {archivedReferences.length}{" "}
              {archivedReferences.length === 1
                ? "exercise is archived"
                : "exercises are archived"}
            </AlertTitle>
            <AlertDescription>
              <ul className="space-y-0.5">
                {archivedReferences.slice(0, MAX_LISTED).map((r, i) => (
                  <li key={i}>
                    {r.exerciseName} — {r.sessionName}
                  </li>
                ))}
                {archivedReferences.length > MAX_LISTED && (
                  <li>and {archivedReferences.length - MAX_LISTED} more</li>
                )}
              </ul>
              <p>
                They come across marked for repair. Replace or remove them
                before activating.
              </p>
            </AlertDescription>
          </Alert>
        )}
      </MesocycleForm>
    </section>
  );
}
