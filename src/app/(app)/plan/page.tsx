import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  MesocycleStatusBadge,
  SectionHeading,
  StickyActions,
} from "@/components/plan/plan-bits";
import { formatPlanRange } from "@/lib/plan/calendar";
import {
  hasCloneSource,
  listMesocyclesForHome,
  type MesocycleSummaryDto,
} from "@/lib/plan/queries";

export const metadata = { title: "Plan · Overload" };

function dateRange(m: MesocycleSummaryDto): string | null {
  return m.startDate && m.endDate
    ? formatPlanRange(m.startDate, m.endDate)
    : null;
}

function draftMeta(m: MesocycleSummaryDto): string {
  return m.issueCount === 0
    ? "Ready to activate"
    : `${m.issueCount} ${m.issueCount === 1 ? "item" : "items"} to finish`;
}

function MesocycleRow({ m, meta }: { m: MesocycleSummaryDto; meta: string }) {
  return (
    <li>
      <Link
        href={`/plan/${m.id}`}
        className="flex min-h-14 items-center gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1">
          <p
            className={
              m.status === "archived"
                ? "flex items-center gap-2 text-sm font-medium text-muted-foreground"
                : "flex items-center gap-2 text-sm font-medium"
            }
          >
            <span className="truncate">{m.name}</span>
            <MesocycleStatusBadge status={m.status} />
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">{meta}</p>
        </div>
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </Link>
    </li>
  );
}

export default async function PlanHomePage() {
  const [home, canClone] = await Promise.all([
    listMesocyclesForHome(),
    hasCloneSource(),
  ]);
  const { active, drafts, previous } = home;
  const nothing = !active && drafts.length === 0 && previous.length === 0;

  if (nothing) {
    return (
      <section className="space-y-6">
        <h1 className="text-lg font-semibold">Plan</h1>
        <EmptyState
          title="No mesocycle yet. Create your first one."
          action={
            <Button asChild variant="outline">
              <Link href="/plan/new">New mesocycle</Link>
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-24 md:pb-0">
      <h1 className="text-lg font-semibold">Plan</h1>

      {active ? (
        <Link
          href={`/plan/${active.id}`}
          className="block rounded-lg border border-border bg-card p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 text-base font-medium">
                <span className="truncate">{active.name}</span>
                <MesocycleStatusBadge status="active" />
              </p>
              {dateRange(active) && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {dateRange(active)}
                </p>
              )}
              <p className="text-sm text-muted-foreground tabular-nums">
                {active.lengthWeeks}{" "}
                {active.lengthWeeks === 1 ? "week" : "weeks"} · deload week{" "}
                {active.deloadWeek}
              </p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {active.splitLabel} · {active.sessionCount}{" "}
                {active.sessionCount === 1 ? "session" : "sessions"}
              </p>
              {active.issueCount > 0 && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {active.issueCount}{" "}
                  {active.issueCount === 1 ? "item needs" : "items need"}{" "}
                  attention
                </p>
              )}
            </div>
            <ChevronRight
              aria-hidden
              className="mt-1 size-4 text-muted-foreground"
            />
          </div>
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing is active. Finish a draft and activate it.
        </p>
      )}

      {drafts.length > 0 && (
        <div>
          <SectionHeading>Drafts</SectionHeading>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {drafts.map((m) => (
              <MesocycleRow key={m.id} m={m} meta={draftMeta(m)} />
            ))}
          </ul>
        </div>
      )}

      {previous.length > 0 && (
        <div>
          <SectionHeading>Previous</SectionHeading>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {previous.map((m) => (
              <MesocycleRow
                key={m.id}
                m={m}
                meta={dateRange(m) ?? "Never activated"}
              />
            ))}
          </ul>
        </div>
      )}

      <StickyActions>
        <div className="flex gap-3">
          <Button asChild className="h-11 flex-1">
            <Link href="/plan/new">
              <Plus aria-hidden />
              New mesocycle
            </Link>
          </Button>
          {canClone && CLONE_FORWARD_AVAILABLE && (
            <Button asChild variant="outline" className="h-11 flex-1">
              <Link href="/plan/clone">Clone previous</Link>
            </Button>
          )}
        </div>
      </StickyActions>
    </section>
  );
}

/** Clone-forward ships in OVE-19; until then the entry point stays hidden. */
const CLONE_FORWARD_AVAILABLE = false;
