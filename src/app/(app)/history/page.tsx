import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getWeekSchedule, type WeekDayState } from "@/lib/logging/queries";

export const metadata = { title: "History · Overload" };

const STATE_LABEL: Record<WeekDayState, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  complete: "Done",
  skipped: "Skipped",
  shifted: "Shifted",
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const requested = sp.week ? Number(sp.week) : undefined;
  const week = await getWeekSchedule(
    requested && Number.isFinite(requested) ? requested : undefined,
  );

  if (!week) {
    return (
      <section className="space-y-4">
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

  const prev = week.weekNumber > 1 ? week.weekNumber - 1 : null;
  const next = week.weekNumber < week.lengthWeeks ? week.weekNumber + 1 : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-sm">
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

      {week.days.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            No training scheduled this week.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {week.days.map((d, i) => {
            const openable =
              d.loggedSessionId &&
              (d.state === "complete" || d.state === "in_progress");
            const row = (
              <div className="flex items-center justify-between px-4 py-3 text-sm tabular-nums">
                <span className="w-28 text-muted-foreground">{d.dayLabel}</span>
                <span className="flex-1">{d.sessionName}</span>
                <span
                  className={
                    d.state === "complete"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {STATE_LABEL[d.state]}
                </span>
              </div>
            );
            return (
              <li key={i}>
                {openable ? (
                  <Link
                    href={`/history/${d.loggedSessionId}`}
                    className="block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
