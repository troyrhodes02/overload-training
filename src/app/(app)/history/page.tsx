import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getWeekSchedule,
  type WeekDayDto,
  type WeekDayState,
} from "@/lib/logging/queries";
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

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const account = await requireAccount();
  const sp = await searchParams;
  const requested = sp.week ? Number(sp.week) : undefined;
  const week = await getWeekSchedule(
    account,
    requested && Number.isFinite(requested) ? requested : undefined,
  );

  if (!week) {
    return (
      <section className="space-y-4" {...tourAnchor("page-history")}>
        <p className="font-medium">No active plan.</p>
        <p className="text-sm text-muted-foreground">
          Activate a mesocycle to see your training week.{" "}
          <Link href="/plan" className="underline">
            Plan →
          </Link>
        </p>
      </section>
    );
  }

  const groups = groupByDay(week.days, week.cardio);
  const prev = week.weekNumber > 1 ? week.weekNumber - 1 : null;
  const next = week.weekNumber < week.lengthWeeks ? week.weekNumber + 1 : null;

  return (
    <section className="space-y-3">
      <div
        className="flex items-center justify-between text-sm"
        {...tourAnchor("page-history")}
      >
        {prev ? (
          <Link
            href={`/history?week=${prev}`}
            className="text-muted-foreground"
          >
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className="size-4" />
        )}
        <span className="font-medium">
          Week {week.weekNumber} · {week.rangeLabel}
        </span>
        {next ? (
          <Link
            href={`/history?week=${next}`}
            className="text-muted-foreground"
          >
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="size-4" />
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            No training scheduled this week.
          </p>
        </div>
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
      )}
    </section>
  );
}
