import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CreatedToast } from "@/components/feedback/created-toast";
import {
  ActivateButton,
  MesocycleMenu,
} from "@/components/plan/lifecycle-controls";
import {
  BackLink,
  MesocycleStatusBadge,
  MetaLine,
  ReadinessPanel,
  SectionHeading,
  StickyActions,
} from "@/components/plan/plan-bits";
import { UnscheduledList, WeekList } from "@/components/plan/week-list";
import { formatPlanDate } from "@/lib/plan/calendar";
import { getMesocycleWeek } from "@/lib/plan/queries";

export const metadata = { title: "Mesocycle · Overload" };

type PageProps = {
  params: Promise<{ mesocycleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Clone-forward ships in OVE-19; until then its entry points stay hidden. */
const CLONE_FORWARD_AVAILABLE = false;

export default async function MesocyclePage({
  params,
  searchParams,
}: PageProps) {
  const [{ mesocycleId }, sp] = await Promise.all([params, searchParams]);
  const m = await getMesocycleWeek(mesocycleId);
  if (!m) notFound();

  const archived = m.status === "archived";
  const dates =
    m.startDate && m.endDate
      ? archived
        ? `${formatPlanDate(m.startDate)} – ${formatPlanDate(m.endDate)}`
        : `Starts ${formatPlanDate(m.startDate)} · ends ${formatPlanDate(m.endDate)}`
      : "No start date yet";

  return (
    <section className="space-y-6 pb-28 md:pb-0">
      <CreatedToast show={sp.created === "1"} message="Draft created" />
      <CreatedToast show={sp.saved === "1"} message="Details saved" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <BackLink href="/plan" label="Plan" />
          <MesocycleMenu
            mesocycleId={m.id}
            status={m.status}
            canClone={CLONE_FORWARD_AVAILABLE}
          />
        </div>
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <span
              className={
                archived ? "truncate text-muted-foreground" : "truncate"
              }
            >
              {m.name}
            </span>
            <MesocycleStatusBadge status={m.status} />
          </h1>
          <MetaLine>{dates}</MetaLine>
          <MetaLine>
            {m.lengthWeeks} {m.lengthWeeks === 1 ? "week" : "weeks"} · deload
            week {m.deloadWeek} · {m.splitLabel}
          </MetaLine>
          {archived && (
            <p className="text-sm text-muted-foreground">
              Archived. Clone it forward to train it again.
            </p>
          )}
        </div>
        {!archived && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/plan/${m.id}/details`}>Edit details</Link>
          </Button>
        )}
      </div>

      <ReadinessPanel
        mesocycleId={m.id}
        status={m.status}
        issues={m.readiness.issues}
      />

      <div>
        <SectionHeading>Week</SectionHeading>
        <WeekList mesocycleId={m.id} week={m.week} />
      </div>

      {m.unscheduled.length > 0 && (
        <div>
          <SectionHeading>Not on the schedule</SectionHeading>
          <UnscheduledList mesocycleId={m.id} sessions={m.unscheduled} />
        </div>
      )}

      {m.status === "draft" && (
        <StickyActions>
          <ActivateButton
            mesocycleId={m.id}
            name={m.name}
            startDate={m.startDate}
            ready={m.readiness.ready}
            issueCount={m.readiness.issues.length}
            activeOther={m.activeOther}
          />
        </StickyActions>
      )}
      {archived && CLONE_FORWARD_AVAILABLE && (
        <StickyActions>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link href={`/plan/clone/${m.id}`}>Clone forward</Link>
          </Button>
        </StickyActions>
      )}
    </section>
  );
}
