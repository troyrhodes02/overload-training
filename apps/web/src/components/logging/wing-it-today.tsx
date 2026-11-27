import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { WingItTodayDto } from "@overload/shared/contracts/views";
import {
  WING_IT_COPY,
  wingItBlockedMessage,
  wingItBlockedResume,
  wingItFinishedLine,
  wingItOpenLine,
} from "@overload/shared/logging/wing-it";

/** Which helper line the section shows beside the day's state. */
export type WingItPlacement = "no_plan" | "rest" | "planned";

/**
 * Today's Wing-It section (Pitch 25 design §6.1–§6.5; preview.tsx): on every
 * dashboard state, its own card, always outside the dimmed missed-day block,
 * never replacing the day's planned workout. Primary only with no plan.
 * Start goes to /log/wing-it (the gym choice); an open Wing-It workout is
 * resumed; a workout in progress with saved sets is named, with Resume.
 * Server-rendered: no client state.
 */
export function WingItToday({
  wingIt,
  placement,
}: {
  wingIt: WingItTodayDto | undefined;
  placement: WingItPlacement;
}) {
  const open = wingIt?.open ?? null;
  const blocked = open ? null : (wingIt?.blockedBy ?? null);
  const primary = placement === "no_plan";
  const helper =
    open || placement === "no_plan"
      ? null
      : placement === "rest"
        ? WING_IT_COPY.helperRest
        : WING_IT_COPY.helperPlanned;
  return (
    <section
      aria-labelledby="wing-it-heading"
      className="rounded-lg border border-border bg-card p-6"
    >
      <h2 id="wing-it-heading" className="text-sm font-medium">
        {WING_IT_COPY.heading}
      </h2>
      {open ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {wingItOpenLine(open)}
        </p>
      ) : null}
      {helper ? (
        <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
      ) : null}
      {(wingIt?.finishedToday ?? []).length > 0 ? (
        <ul className="mt-3 space-y-2">
          {wingIt!.finishedToday.map((w) => (
            <li
              key={w.loggedSessionId}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
            >
              <span>{wingItFinishedLine(w)}</span>
              <Link
                href={`/history/${w.loggedSessionId}`}
                className="text-primary"
              >
                View workout
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        asChild
        variant={primary ? "default" : "secondary"}
        size={primary ? "lg" : "default"}
        className="mt-4 h-11 w-full"
      >
        <Link href={open ? `/log/${open.loggedSessionId}` : "/log/wing-it"}>
          {open ? WING_IT_COPY.resume : WING_IT_COPY.start}
        </Link>
      </Button>
      {blocked ? (
        // Nothing starts and nothing is discarded (RD-5): the lifter resumes
        // (and can finish) the workout that holds saved sets. /log/wing-it
        // says the same if Start is chosen anyway.
        <div className="mt-3 rounded-md border border-border p-3 text-sm text-muted-foreground">
          {wingItBlockedMessage(blocked.sessionName)}{" "}
          <Link
            href={`/log/${blocked.loggedSessionId}`}
            className="font-medium text-foreground underline"
          >
            {wingItBlockedResume(blocked.sessionName)}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
