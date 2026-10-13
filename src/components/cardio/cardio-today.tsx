import Link from "next/link";
import type { CardioOccurrenceDto } from "@/lib/cardio/queries";
import {
  LogCardioButton,
  LoggedCardioButton,
} from "@/components/cardio/cardio-log-dialog";

/**
 * Today's cardio on the dashboard (Cardio Logging design Screen 4). Lifting
 * keeps the floor: on a combined day this card sits BELOW the lifting block
 * and its Start/Resume button, and its Log action is secondary. On a
 * cardio-only day the cardio is the focal block with the primary action.
 * No tag, chart, timer, or metric — only the activity and minutes.
 */

const Label = () => (
  <p className="text-xs tracking-wide text-muted-foreground uppercase">
    Cardio
  </p>
);

/** Combined day: a smaller card beneath the lifting workflow. */
export function CardioCard({ entry }: { entry: CardioOccurrenceDto }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <Label />
      {entry.log ? (
        <div className="mt-1">
          <LoggedCardioButton entry={entry} />
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-sm tabular-nums">
            {entry.planned.type} — {entry.planned.durationMin} min
          </p>
          <LogCardioButton entry={entry} />
        </div>
      )}
    </div>
  );
}

export function CardioCards({ entries }: { entries: CardioOccurrenceDto[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <CardioCard key={e.scheduledFor} entry={e} />
      ))}
    </div>
  );
}

/** Cardio-only day: the cardio IS the day's training — a real focal block. */
export function CardioFocal({
  entries,
  week,
}: {
  entries: CardioOccurrenceDto[];
  week: number;
}) {
  const pending = entries.filter((e) => !e.log);
  if (pending.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">✓ Cardio complete</p>
        <div className="mt-2 space-y-1">
          {entries.map((e) => (
            <LoggedCardioButton key={e.scheduledFor} entry={e} large />
          ))}
        </div>
        <Link
          href="/history"
          className="mt-3 inline-block text-sm text-muted-foreground"
        >
          History →
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Cardio</p>
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          Week {week}
        </p>
        <div className="mt-3 space-y-1">
          {entries.map((e) =>
            e.log ? (
              <LoggedCardioButton key={e.scheduledFor} entry={e} large />
            ) : (
              <p key={e.scheduledFor} className="text-base tabular-nums">
                {e.planned.type} — {e.planned.durationMin} min
              </p>
            ),
          )}
        </div>
      </div>
      {pending.map((e) => (
        <LogCardioButton
          key={e.scheduledFor}
          entry={e}
          variant="default"
          className="w-full"
        >
          {pending.length > 1 ? `Log ${e.planned.type}` : "Log cardio"}
        </LogCardioButton>
      ))}
    </div>
  );
}
