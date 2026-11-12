import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { WeekDayDto, WeekDayState } from "@/lib/logging/queries";
import {
  getHistoryWeek,
  type HistoryWeekDto,
  type LoggedHistoryDay,
} from "@/lib/logging/history-week";
import type { CardioOccurrenceDto } from "@/lib/cardio/queries";
import { CardioHistoryLine } from "@/components/cardio/cardio-history-line";
import { requireAccount } from "@/lib/data/account";
import { tourAnchor } from "@/lib/tour/steps";

export const metadata = { title: "History · Overload" };

const STATE_LABEL: Record<WeekDayState, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  complete: "Done",
  skipped: "Skipped",
  shifted: "Shifted",
};

/**
 * The week, day by day (Cardio Logging design Screen 6): each effective date
 * groups its lifting line(s) first, then its cardio line(s). A cardio-only
 * day is a group of its own.
 */
type DayGroup = {
  dateIso: string;
  lifting: WeekDayDto[];
  cardio: CardioOccurrenceDto[];
};

function groupByDay(
  days: WeekDayDto[],
  cardio: CardioOccurrenceDto[],
): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  const group = (dateIso: string) => {
    let g = groups.get(dateIso);
    if (!g) {
      g = { dateIso, lifting: [], cardio: [] };
      groups.set(dateIso, g);
    }
    return g;
  };
  for (const d of days) group(d.dateIso).lifting.push(d);
  for (const c of cardio) group(c.dateIso).cardio.push(c);
  return [...groups.values()].sort((a, b) =>
    a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0,
  );
}

function LiftingRow({ d, showDate }: { d: WeekDayDto; showDate: boolean }) {
  const openable =
    d.loggedSessionId && (d.state === "complete" || d.state === "in_progress");
  const row = (
    <div className="flex items-center justify-between px-4 py-3 text-sm tabular-nums">
      <span className="w-28 text-muted-foreground">
        {showDate ? d.dayLabel : null}
      </span>
      <span className="flex-1">{d.sessionName}</span>
      <span
        className={
          d.state === "complete" ? "text-foreground" : "text-muted-foreground"
        }
      >
        {STATE_LABEL[d.state]}
      </span>
    </div>
  );
  return openable ? (
    <Link
      href={`/history/${d.loggedSessionId}`}
      className="block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {row}
    </Link>
  ) : (
    row
  );
}

const BLOCK_STATUS: Record<string, string> = {
  archived: "archived",
  draft: "draft",
  active: "active",
};

function blockLine(week: HistoryWeekDto): string {
  if (week.view.kind === "active") {
    return `${week.view.blockName} · Week ${week.view.weekNumber} of ${week.view.lengthWeeks}`;
  }
  if (week.view.blocks.length === 0) return "Between blocks";
  return week.view.blocks
    .map((b) => `${b.name} · ${BLOCK_STATUS[b.status] ?? b.status}`)
    .join(", ");
}

function LoggedDay({ day }: { day: LoggedHistoryDay }) {
  return (
    <li className="py-1">
      {day.workouts.map((w, i) => (
        <Link
          key={w.loggedSessionId}
          href={`/history/${w.loggedSessionId}`}
          className="block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <div className="flex items-center justify-between px-4 py-3 text-sm tabular-nums">
            <span className="w-28 text-muted-foreground">
              {i === 0 ? day.dayLabel : null}
            </span>
            <span className="flex-1">{w.sessionName}</span>
            <span
              className={
                w.state === "complete"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }
            >
              {STATE_LABEL[w.state]}
            </span>
          </div>
        </Link>
      ))}
      {day.cardio.map((c, i) => (
        <div
          key={c.cardioLogId}
          className="flex items-center justify-between px-4 py-3 text-sm tabular-nums"
        >
          <span className="w-28 text-muted-foreground">
            {day.workouts.length === 0 && i === 0 ? day.dayLabel : null}
          </span>
          <span className="flex-1">{c.type}</span>
          <span className="text-muted-foreground">{c.durationMin} min</span>
        </div>
      ))}
    </li>
  );
}

function WeekNav({ week }: { week: HistoryWeekDto }) {
  const link = (weekStart: string) => `/history?week=${weekStart}`;
  return (
    <div className="space-y-1" {...tourAnchor("page-history")}>
      <div className="flex items-center justify-between text-sm">
        {week.prevWeekStart ? (
          <Link
            href={link(week.prevWeekStart)}
            aria-label="Previous week"
            className="-m-2 p-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className="size-4" />
        )}
        <span className="font-medium tabular-nums">{week.rangeLabel}</span>
        {week.nextWeekStart ? (
          <Link
            href={link(week.nextWeekStart)}
            aria-label="Next week"
            className="-m-2 p-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="size-4" />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{blockLine(week)}</span>
        {week.isThisWeek ? null : (
          <Link
            href={link(week.thisWeekStart)}
            className="shrink-0 underline-offset-4 hover:text-foreground hover:underline"
          >
            This week
          </Link>
        )}
      </div>
    </div>
  );
}

function EmptyWeek({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/**
 * All-time history (OVE-141–146): any week back to the first logged day. A
 * week of the active block shows its plan as before (planned, missed, logged,
 * cardio); any other week shows only what was logged, with its block's name.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const account = await requireAccount();
  const sp = await searchParams;
  const week = await getHistoryWeek(account, sp.week ?? null);

  if (!week.hasAnyHistory) {
    return (
      <section className="space-y-4" {...tourAnchor("page-history")}>
        <p className="font-medium">No training logged yet.</p>
        <p className="text-sm text-muted-foreground">
          Activate a mesocycle to start your training week.{" "}
          <Link href="/plan" className="underline">
            Plan →
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <WeekNav week={week} />

      {week.view.kind === "active" ? (
        (() => {
          const groups = groupByDay(week.view.days, week.view.cardio);
          return groups.length === 0 ? (
            <EmptyWeek text="No training scheduled this week." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {groups.map((g) => (
                <li key={g.dateIso} className="py-1">
                  {g.lifting.map((d, i) => (
                    <LiftingRow
                      key={`${d.sessionName}-${i}`}
                      d={d}
                      showDate={i === 0}
                    />
                  ))}
                  {g.cardio.map((c, i) => (
                    <CardioHistoryLine
                      key={c.scheduledFor}
                      entry={c}
                      dateLabel={
                        g.lifting.length === 0 && i === 0 ? c.dateLabel : null
                      }
                    />
                  ))}
                </li>
              ))}
            </ul>
          );
        })()
      ) : week.view.days.length === 0 ? (
        <EmptyWeek text="Nothing logged this week." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {week.view.days.map((d) => (
            <LoggedDay key={d.dateIso} day={d} />
          ))}
        </ul>
      )}

      {week.earlierBlocks.length > 0 ? (
        <nav aria-label="Earlier blocks" className="space-y-2 pt-3">
          <p className="text-xs text-muted-foreground">Earlier blocks</p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {week.earlierBlocks.map((b) => (
              <li key={b.mesocycleId}>
                <Link
                  href={`/history?week=${b.weekStart}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="truncate">{b.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {b.rangeLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}
