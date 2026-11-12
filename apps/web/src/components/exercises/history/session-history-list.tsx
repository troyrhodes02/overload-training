import Link from "next/link";
import { ProgressTag } from "@/components/progression/progress-tag";
import type {
  SessionCallKind,
  SessionRowDto,
} from "@/lib/progression/history-types";
import { RECENT_SESSIONS } from "@/lib/progression/history";
import { formatRirLine, formatSetLine } from "@/lib/progression/history-format";

/** The muted words for every call that isn't one of the engine's tags (spec §6). */
const MUTED_CALL: Partial<Record<SessionCallKind, string>> = {
  hold: "Hold",
  insufficient: "Not enough history",
  deload_week: "Deload week",
  not_counted: "Not counted",
  in_progress: "In progress",
};

/**
 * Every session of one scope, newest first (design doc §4.4, Screen 1;
 * preview §04): the date (opening that workout, where a set is corrected),
 * the sets exactly as logged, RIR when recorded, a swap note, and on the
 * right the call that session led to — the engine's tag, or a muted word.
 * An ordinary hold is the word "Hold", never a badge (R13). A list, not a
 * table, so it reads on a phone without sideways scrolling.
 */
export function SessionHistoryList({
  rows,
  total,
  showingAll,
  externalLoad,
  noGymScope,
  viewAllHref,
  recentOnlyHref,
  scopeName,
}: {
  rows: SessionRowDto[];
  total: number;
  showingAll: boolean;
  externalLoad: boolean;
  noGymScope: boolean;
  viewAllHref: string;
  recentOnlyHref: string;
  /** The gym, for a machine or cable; null otherwise. */
  scopeName: string | null;
}) {
  return (
    <section aria-labelledby="sessions-heading" className="space-y-2">
      <h2 id="sessions-heading" className="text-base font-medium">
        Sessions
        {scopeName ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            · {scopeName}
          </span>
        ) : null}
      </h2>
      <p className="text-xs text-muted-foreground">
        {noGymScope
          ? "Machine calls are made per gym, so these sessions have none."
          : "The call each session led to, from your sets as they are now."}
      </p>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const rir = formatRirLine(r.workingSets);
          return (
            <li
              key={r.loggedExerciseId}
              className="flex flex-col gap-0.5 py-2.5 first:pt-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-sm">
                <span>
                  <Link
                    href={`/history/${r.loggedSessionId}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {r.dateLabel}
                  </Link>
                  {r.gymName ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {r.gymName}
                      {r.gymArchived ? " (archived)" : ""}
                    </span>
                  ) : null}
                </span>
                <Call row={r} />
              </div>
              <span className="text-sm tabular-nums">
                {formatSetLine(r, externalLoad)}
              </span>
              {rir ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {rir}
                </span>
              ) : null}
              {r.call === "not_counted" ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {r.workingSets.length} of {r.plannedSets} planned sets
                </span>
              ) : null}
              {r.swappedFromName ? (
                <span className="text-xs text-muted-foreground">
                  In place of {r.swappedFromName}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {total > rows.length ? (
        <Link
          href={viewAllHref}
          className="inline-flex min-h-11 items-center text-sm text-primary"
        >
          View all {total} sessions
        </Link>
      ) : showingAll && total > RECENT_SESSIONS ? (
        <Link
          href={recentOnlyHref}
          className="inline-flex min-h-11 items-center text-sm text-primary"
        >
          Show recent only
        </Link>
      ) : null}
    </section>
  );
}

function Call({ row }: { row: SessionRowDto }) {
  const { call } = row;
  if (call === "progress" || call === "deload" || call === "stalled") {
    return <ProgressTag state={call} />;
  }
  const words = MUTED_CALL[call];
  if (!words) return null;
  return (
    <span className="shrink-0 text-xs text-muted-foreground">{words}</span>
  );
}
