"use client";

import {
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPlanDate } from "@overload/shared/plan/calendar";
import {
  rescheduleWorkoutAction,
  skipUpcomingWorkoutAction,
} from "@/app/(app)/log/actions";
import type {
  ThisWeekDay,
  ThisWeekDto,
  ThisWeekWorkout,
} from "@/lib/logging/this-week";

/**
 * Today's week strip (OVE-240), web only. Seven days of the current block
 * week; today is selected first. Selecting a day only changes what is shown
 * below it: today shows Today as always (passed in as `children`), another
 * day shows a preview of that day. Nothing is written until the lifter
 * confirms one of this week's adjustments in a dialog: skip a workout, train
 * a later workout today, or swap two days. The plan itself never changes, and
 * next week keeps its normal schedule. Client island; the server re-checks
 * every rule.
 */

type OpenDialog =
  | { kind: "skip"; day: ThisWeekDay; workout: ThisWeekWorkout }
  | { kind: "train-today"; day: ThisWeekDay; workout: ThisWeekWorkout }
  | { kind: "swap"; day: ThisWeekDay; workout: ThisWeekWorkout };

const STATE_WORDS: Record<ThisWeekWorkout["state"], string> = {
  upcoming: "planned",
  in_progress: "in progress",
  complete: "done",
  skipped: "skipped",
};

function dayAriaLabel(day: ThisWeekDay): string {
  const parts = [day.dayLabel];
  if (day.isToday) parts.push("today");
  if (day.workout) {
    parts.push(`${day.workout.sessionName}, ${STATE_WORDS[day.workout.state]}`);
  } else {
    parts.push("rest day");
  }
  for (const s of day.skipped) parts.push(`${s.sessionName} skipped`);
  return parts.join(", ");
}

export function ThisWeekStrip({
  week,
  children,
}: {
  week: ThisWeekDto;
  children: ReactNode;
}) {
  const [selectedIso, setSelectedIso] = useState(week.today);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  // After midnight (or a refresh into another week) fall back to today.
  const selected =
    week.days.find((d) => d.dateIso === selectedIso) ??
    week.days.find((d) => d.isToday) ??
    week.days[0];
  const todayDay = week.days.find((d) => d.isToday) ?? null;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Tabs pattern: arrows, Home, and End move the selected day.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = week.days.findIndex((d) => d.dateIso === selected.dateIso);
    const next =
      e.key === "ArrowRight"
        ? Math.min(i + 1, week.days.length - 1)
        : e.key === "ArrowLeft"
          ? Math.max(i - 1, 0)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? week.days.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setSelectedIso(week.days[next].dateIso);
    tabs.current[next]?.focus();
  }

  return (
    <>
      <section aria-labelledby="this-week-heading" className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="this-week-heading" className="text-sm font-medium">
            This week{" "}
            <span className="font-normal text-muted-foreground">
              · Week {week.weekNumber} of {week.lengthWeeks}
              {week.scheduledDeloadWeek ? " · Deload week" : ""}
            </span>
          </h2>
        </div>
        <div
          className="grid grid-cols-7 gap-0.5 sm:gap-1"
          role="tablist"
          aria-labelledby="this-week-heading"
          onKeyDown={onKeyDown}
        >
          {week.days.map((day, i) => (
            <DayCell
              key={day.dateIso}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              day={day}
              selected={day.dateIso === selected.dateIso}
              onSelect={() => setSelectedIso(day.dateIso)}
            />
          ))}
        </div>
      </section>

      <div
        id="this-week-panel"
        role="tabpanel"
        aria-label={selected.isToday ? "Today" : selected.dayLabel}
        className="space-y-6"
      >
        {selected.isToday ? (
          <>
            {selected.workout?.adjustable ? (
              <TodayActions
                day={selected}
                workout={selected.workout}
                blockedReason={week.blockedReason}
                onOpen={setDialog}
              />
            ) : null}
            {children}
          </>
        ) : (
          <DayPreview
            day={selected}
            todayDay={todayDay}
            blockedReason={week.blockedReason}
            onOpen={setDialog}
            onBackToToday={() => setSelectedIso(week.today)}
          />
        )}
      </div>

      {dialog?.kind === "skip" ? (
        <SkipDialog
          mesocycleId={week.mesocycleId}
          day={dialog.day}
          workout={dialog.workout}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "train-today" ? (
        <TrainTodayDialog
          mesocycleId={week.mesocycleId}
          today={week.today}
          day={dialog.day}
          workout={dialog.workout}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "swap" ? (
        <SwapDialog
          week={week}
          day={dialog.day}
          workout={dialog.workout}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

function DayCell({
  ref,
  day,
  selected,
  onSelect,
}: {
  ref: (el: HTMLButtonElement | null) => void;
  day: ThisWeekDay;
  selected: boolean;
  onSelect: () => void;
}) {
  const w = day.workout;
  const label = w ? w.sessionName : day.skipped.length > 0 ? "Skipped" : "Rest";
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      onClick={onSelect}
      aria-selected={selected}
      aria-controls="this-week-panel"
      tabIndex={selected ? 0 : -1}
      aria-label={dayAriaLabel(day)}
      aria-current={day.isToday ? "date" : undefined}
      data-testid={`week-day-${day.dateIso}`}
      className={cn(
        "flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-0.5 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-accent text-accent-foreground"
          : "border-transparent hover:bg-accent/60",
        day.isPast && !selected ? "opacity-60" : null,
      )}
    >
      <span className="text-[11px] text-muted-foreground">{day.weekday}</span>
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-sm tabular-nums",
          day.isToday
            ? "bg-primary font-semibold text-primary-foreground"
            : null,
        )}
      >
        {day.dayOfMonth}
      </span>
      <span
        className={cn(
          "flex w-full min-w-0 items-center justify-center gap-0.5 text-[11px] leading-tight",
          w ? "text-foreground" : "text-muted-foreground",
          !w && day.skipped.length > 0 ? "line-through" : null,
        )}
      >
        {w?.state === "complete" ? (
          <Check aria-hidden className="size-3 shrink-0 text-primary" />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
    </button>
  );
}

/** Today's own workout: swap or skip it, above Today as always. */
function TodayActions({
  day,
  workout,
  blockedReason,
  onOpen,
}: {
  day: ThisWeekDay;
  workout: ThisWeekWorkout;
  blockedReason: string | null;
  onOpen: (d: OpenDialog) => void;
}) {
  if (blockedReason) return null;
  return (
    <div className="flex items-center justify-end gap-1">
      <span className="sr-only">
        Change today&apos;s {workout.sessionName}:
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-11"
        onClick={() => onOpen({ kind: "swap", day, workout })}
      >
        Swap day
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-11"
        onClick={() => onOpen({ kind: "skip", day, workout })}
      >
        Skip workout
      </Button>
    </div>
  );
}

/** Another day of the week: what sits on it, and what can change. */
function DayPreview({
  day,
  todayDay,
  blockedReason,
  onOpen,
  onBackToToday,
}: {
  day: ThisWeekDay;
  todayDay: ThisWeekDay | null;
  blockedReason: string | null;
  onOpen: (d: OpenDialog) => void;
  onBackToToday: () => void;
}) {
  const w = day.workout;
  const todayTaken = todayDay?.workout ?? null;
  return (
    <div
      className="rounded-lg border border-border bg-card p-6"
      data-testid="week-day-preview"
    >
      <p className="text-sm text-muted-foreground">
        {day.dayLabel}
        {day.isPast ? " · earlier this week" : ""}
      </p>
      {w ? (
        <>
          <p className="mt-1 font-medium">
            {w.sessionName}
            {w.state !== "upcoming" ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {STATE_WORDS[w.state]}
              </span>
            ) : null}
          </p>
          {w.movedFrom ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Moved this week from {formatPlanDate(w.movedFrom)}.
            </p>
          ) : null}
          {w.state === "upcoming" && w.exercises.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm">
              {w.exercises.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0">{e.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {e.scheme}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {w.loggedSessionId && w.state === "in_progress" ? (
              <Button asChild className="h-11">
                <Link href={`/log/${w.loggedSessionId}`}>Resume workout</Link>
              </Button>
            ) : null}
            {w.loggedSessionId && w.state === "complete" ? (
              <Button asChild variant="secondary" className="h-11">
                <Link href={`/history/${w.loggedSessionId}`}>View workout</Link>
              </Button>
            ) : null}
            {w.adjustable && !blockedReason ? (
              <>
                {todayTaken === null ? (
                  <Button
                    className="h-11"
                    onClick={() =>
                      onOpen({ kind: "train-today", day, workout: w })
                    }
                  >
                    Train today
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  className="h-11"
                  onClick={() => onOpen({ kind: "swap", day, workout: w })}
                >
                  Swap day
                </Button>
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => onOpen({ kind: "skip", day, workout: w })}
                >
                  Skip workout
                </Button>
              </>
            ) : null}
          </div>
          {w.adjustable && !blockedReason && todayTaken !== null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {todayTaken.adjustable
                ? `Today already has ${todayTaken.sessionName}. To train ${w.sessionName} today, swap the two days.`
                : `Today already has ${todayTaken.sessionName}, so ${w.sessionName} stays on another day.`}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-1 font-medium">Rest day</p>
      )}
      {day.skipped.map((s) => (
        <p key={s.sessionId} className="mt-2 text-sm text-muted-foreground">
          {s.sessionName} is skipped this week.
        </p>
      ))}
      {w?.adjustable && blockedReason ? (
        <p className="mt-3 text-sm text-muted-foreground">{blockedReason}</p>
      ) : null}
      <button
        type="button"
        onClick={onBackToToday}
        className="mt-4 text-sm text-primary underline-offset-4 hover:underline"
      >
        Back to today
      </button>
    </div>
  );
}

function useAdjustment() {
  const router = useRouter();
  const [error, setError] = useState<{
    message: string;
    stale: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  return { router, error, setError, pending, startTransition };
}

function ErrorNote({
  error,
  onReload,
}: {
  error: { message: string; stale: boolean } | null;
  onReload: () => void;
}) {
  if (!error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>
        {error.message}
        {error.stale ? (
          <>
            {" "}
            <button type="button" className="underline" onClick={onReload}>
              Reload
            </button>
          </>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function SkipDialog({
  mesocycleId,
  day,
  workout,
  onClose,
}: {
  mesocycleId: string;
  day: ThisWeekDay;
  workout: ThisWeekWorkout;
  onClose: () => void;
}) {
  const { router, error, setError, pending, startTransition } = useAdjustment();
  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await skipUpcomingWorkoutAction({
        mesocycleId,
        sessionId: workout.sessionId,
        scheduledFor: workout.scheduledFor,
      });
      if (!res.ok) {
        setError({
          message: res.error.message,
          stale: res.error.code === "conflict",
        });
        return;
      }
      toast.info(`${workout.sessionName} skipped this week.`);
      onClose();
      router.refresh();
    });
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skip {workout.sessionName} this week?</DialogTitle>
          <DialogDescription>
            {workout.sessionName} on {day.isToday ? "today" : day.dayLabel} is
            marked skipped. It won&apos;t come back as a missed workout, and
            next week is unchanged. A skip can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <ErrorNote error={error} onReload={() => router.refresh()} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={pending}>
            {pending ? "Skipping…" : "Skip workout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrainTodayDialog({
  mesocycleId,
  today,
  day,
  workout,
  onClose,
}: {
  mesocycleId: string;
  today: string;
  day: ThisWeekDay;
  workout: ThisWeekWorkout;
  onClose: () => void;
}) {
  const { router, error, setError, pending, startTransition } = useAdjustment();
  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await rescheduleWorkoutAction({
        mesocycleId,
        sessionId: workout.sessionId,
        scheduledFor: workout.scheduledFor,
        from: day.dateIso,
        to: today,
        occupant: null,
      });
      if (!res.ok) {
        setError({
          message: res.error.message,
          stale: res.error.code === "conflict",
        });
        return;
      }
      // The existing start flow (gym choice, unfinished-workout warning).
      router.push(
        `/log/start?${new URLSearchParams({
          sessionId: workout.sessionId,
          scheduledFor: workout.scheduledFor,
        })}`,
      );
    });
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Train {workout.sessionName} today?</DialogTitle>
          <DialogDescription>
            {workout.sessionName} moves from {day.dayLabel} to today, for this
            week only. {day.weekday} becomes a rest day. Next week is unchanged.
            Then choose your gym to start.
          </DialogDescription>
        </DialogHeader>
        <ErrorNote error={error} onReload={() => router.refresh()} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={pending}>
            {pending ? "Moving…" : "Move to today"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwapDialog({
  week,
  day,
  workout,
  onClose,
}: {
  week: ThisWeekDto;
  day: ThisWeekDay;
  workout: ThisWeekWorkout;
  onClose: () => void;
}) {
  const { router, error, setError, pending, startTransition } = useAdjustment();
  const options = week.days.filter(
    (d) => !d.isPast && d.dateIso !== day.dateIso,
  );
  const [target, setTarget] = useState<string | null>(null);
  const chosen = options.find((d) => d.dateIso === target) ?? null;
  const reasonBlocked = (d: ThisWeekDay): string | null =>
    d.workout && !d.workout.adjustable
      ? d.workout.state === "complete"
        ? "done"
        : d.workout.state === "in_progress"
          ? "started"
          : "can't move"
      : null;

  function confirm() {
    if (!chosen) return;
    setError(null);
    startTransition(async () => {
      const res = await rescheduleWorkoutAction({
        mesocycleId: week.mesocycleId,
        sessionId: workout.sessionId,
        scheduledFor: workout.scheduledFor,
        from: day.dateIso,
        to: chosen.dateIso,
        occupant: chosen.workout
          ? {
              sessionId: chosen.workout.sessionId,
              scheduledFor: chosen.workout.scheduledFor,
            }
          : null,
      });
      if (!res.ok) {
        setError({
          message: res.error.message,
          stale: res.error.code === "conflict",
        });
        return;
      }
      toast.info("Week updated. Next week is unchanged.");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap {workout.sessionName} with…</DialogTitle>
          <DialogDescription>
            Pick a day this week. The two days trade places for this week only;
            your plan and next week are unchanged.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={target ?? ""}
          onValueChange={setTarget}
          aria-label="Day to swap with"
          className="gap-1"
        >
          {options.map((d) => {
            const blocked = reasonBlocked(d);
            const id = `swap-${d.dateIso}`;
            return (
              <div
                key={d.dateIso}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-2",
                  blocked ? "opacity-50" : "hover:bg-accent/60",
                )}
              >
                <RadioGroupItem
                  value={d.dateIso}
                  id={id}
                  disabled={blocked !== null}
                />
                <Label
                  htmlFor={id}
                  className="flex flex-1 justify-between gap-3 py-2 font-normal"
                >
                  <span>{d.isToday ? "Today" : d.dayLabel}</span>
                  <span className="text-muted-foreground">
                    {d.workout ? d.workout.sessionName : "Rest"}
                    {blocked ? ` · ${blocked}` : ""}
                  </span>
                </Label>
              </div>
            );
          })}
        </RadioGroup>
        {chosen ? (
          <div
            className="rounded-md bg-muted/50 p-3 text-sm"
            aria-live="polite"
          >
            <p className="font-medium">This week after the swap</p>
            <p className="mt-1">
              {day.isToday ? "Today" : day.dayLabel}:{" "}
              {chosen.workout ? chosen.workout.sessionName : "Rest"}
            </p>
            <p>
              {chosen.isToday ? "Today" : chosen.dayLabel}:{" "}
              {workout.sessionName}
            </p>
          </div>
        ) : null}
        <ErrorNote error={error} onReload={() => router.refresh()} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={pending || !chosen}>
            {pending ? "Swapping…" : "Swap days"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
