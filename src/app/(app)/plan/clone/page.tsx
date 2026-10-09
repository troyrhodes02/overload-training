import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { BackLink, MesocycleStatusBadge } from "@/components/plan/plan-bits";
import { formatPlanRange } from "@/lib/plan/calendar";
import { listCloneSources } from "@/lib/plan/queries";

export const metadata = { title: "Clone a mesocycle · Overload" };

/** Choose which prior block to carry forward (active or archived; spec D47). */
export default async function CloneSourcePage() {
  const sources = await listCloneSources();

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <BackLink href="/plan" label="Plan" />
        <h1 className="text-lg font-semibold">Clone a mesocycle</h1>
        {sources.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Copies the plan only. Workout history stays with the original.
          </p>
        )}
      </div>

      {sources.length === 0 ? (
        <EmptyState
          title="Nothing to clone yet. Create a mesocycle first."
          action={
            <Button asChild variant="outline">
              <Link href="/plan/new">New mesocycle</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {sources.map((m) => (
            <li key={m.id}>
              <Link
                href={`/plan/clone/${m.id}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{m.name}</span>
                    <MesocycleStatusBadge status={m.status} />
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {m.splitLabel} · {m.sessionCount}{" "}
                    {m.sessionCount === 1 ? "session" : "sessions"}
                    {m.startDate && m.endDate
                      ? ` · ${formatPlanRange(m.startDate, m.endDate)}`
                      : ""}
                  </p>
                </div>
                <ChevronRight
                  aria-hidden
                  className="size-4 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
