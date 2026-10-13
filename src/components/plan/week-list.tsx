import type { ReactNode } from "react";
import Link from "next/link";
import { DAYS_OF_WEEK } from "@/lib/plan/calendar";
import type { PlannedCardioDto, SessionSummaryDto } from "@/lib/plan/queries";
import { CardioLineContent } from "./cardio-line";

/** "6 exercises", "No exercises yet", "4 exercises · 1 to fix". */
export function sessionMeta(s: SessionSummaryDto): string {
  if (s.exerciseCount === 0) return "No exercises yet";
  const base = `${s.exerciseCount} ${s.exerciseCount === 1 ? "exercise" : "exercises"}`;
  return s.archivedCount > 0 ? `${base} · ${s.archivedCount} to fix` : base;
}

/** Read-only cardio line (archived blocks): "CARDIO  Incline Walk · 20 min". */
function CardioLineStatic({ cardio }: { cardio: PlannedCardioDto }) {
  return (
    <p className="ml-10 flex min-h-11 items-center gap-2 pr-3 text-sm">
      <CardioLineContent cardio={cardio} />
    </p>
  );
}

/**
 * The week: seven rows, Monday first. A day holds one session or reads
 * "Rest", and — on its own line — the day's planned cardio, if any (Cardio
 * Logging: cardio belongs to the day, not the session). Row actions (menus,
 * Add session, the editable cardio line) are passed in by the page so this
 * list stays a server component.
 */
export function WeekList({
  mesocycleId,
  week,
  cardio,
  renderSessionActions,
  renderRestAction,
  renderCardio,
}: {
  mesocycleId: string;
  week: (SessionSummaryDto | null)[];
  cardio?: (PlannedCardioDto | null)[];
  renderSessionActions?: (session: SessionSummaryDto) => ReactNode;
  renderRestAction?: (day: (typeof DAYS_OF_WEEK)[number]) => ReactNode;
  renderCardio?: (cardio: PlannedCardioDto) => ReactNode;
}) {
  return (
    <ul
      id="week"
      className="divide-y divide-border rounded-lg border border-border bg-card"
    >
      {DAYS_OF_WEEK.map((d, i) => {
        const s = week[i];
        const c = cardio?.[i] ?? null;
        return (
          <li key={d.day} className="pr-1 pl-4">
            <div className="flex min-h-14 items-center gap-1">
              <abbr
                title={d.long}
                aria-label={d.long}
                className="w-10 shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase no-underline tabular-nums"
              >
                {d.short}
              </abbr>
              {s ? (
                <>
                  <Link
                    href={`/plan/${mesocycleId}/sessions/${s.id}`}
                    className="min-w-0 flex-1 rounded-md py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {sessionMeta(s)}
                    </p>
                  </Link>
                  {renderSessionActions?.(s)}
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-muted-foreground">
                    Rest
                  </span>
                  {renderRestAction?.(d)}
                </>
              )}
            </div>
            {c &&
              (renderCardio ? (
                renderCardio(c)
              ) : (
                <CardioLineStatic cardio={c} />
              ))}
          </li>
        );
      })}
    </ul>
  );
}

/** Sessions that exist in the mesocycle but sit on no day. */
export function UnscheduledList({
  mesocycleId,
  sessions,
  renderSessionActions,
}: {
  mesocycleId: string;
  sessions: SessionSummaryDto[];
  renderSessionActions?: (session: SessionSummaryDto) => ReactNode;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {sessions.map((s) => (
        <li key={s.id} className="flex min-h-14 items-center gap-1 pr-1 pl-4">
          <Link
            href={`/plan/${mesocycleId}/sessions/${s.id}`}
            className="min-w-0 flex-1 rounded-md py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <p className="truncate text-sm font-medium">{s.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {sessionMeta(s)}
            </p>
          </Link>
          {renderSessionActions?.(s)}
        </li>
      ))}
    </ul>
  );
}
