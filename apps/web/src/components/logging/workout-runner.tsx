"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { WING_IT_COPY } from "@overload/shared/logging/wing-it";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ExerciseCard,
  type CardProgression,
} from "@/components/logging/exercise-card";
import { GymPicker, type GymOption } from "@/components/logging/gym-picker";
import { completeWorkoutAction } from "@/app/(app)/log/actions";
import type { WorkoutDto } from "@/lib/logging/queries";
import { ScheduledDeloadBanner } from "@/components/progression/scheduled-deload-banner";

/**
 * The workout runner (design Screen 4/6). Steps through the planned exercises,
 * one card at a time. The lifter can finish once any set is logged: anything
 * unfinished is listed for confirmation first (no sets → recorded as not done;
 * partly logged → kept as logged). Client island; completion is an explicit,
 * server-validated action.
 *
 * Faster Logging UX (Screen 4, R13, R16): Next names the exercise it goes to;
 * there is no auto-advance. When a confirmed set leaves the card nothing to
 * log, focus moves to Next (or Finish workout); after Next/Previous the new
 * card focuses its next set. Nothing is focused on page load.
 */
export function WorkoutRunner({
  workout,
  activeGyms,
  progression,
  initialExerciseId,
}: {
  workout: WorkoutDto;
  activeGyms: GymOption[];
  /** Derived per-occurrence progression, keyed by loggedExerciseId (OVE-28). */
  progression: Record<string, CardProgression>;
  /** Pitch 25: open on this card (the one just added to a Wing-It workout). */
  initialExerciseId?: string | null;
}) {
  const router = useRouter();
  const wingIt = workout.kind === "wing_it";
  // Pitch 25: a Wing-It exercise removed from the workout (marked not done,
  // nothing saved) is not a card (the server hides it too; spec RD-23).
  const exercises = wingIt
    ? workout.exercises.filter(
        (e) => !(e.openEnded && e.skipped && !e.sets.some((s) => s.saved)),
      )
    : workout.exercises;
  const [rawIndex, setIndex] = useState(() => {
    const at = initialExerciseId
      ? exercises.findIndex((e) => e.loggedExerciseId === initialExerciseId)
      : -1;
    if (at >= 0) return at;
    // A Wing-It workout opens where the lifter left off: the card added last.
    return wingIt ? Math.max(0, exercises.length - 1) : 0;
  });
  // True once the lifter has moved between cards; the first card never
  // takes focus on its own (R13).
  const [navigated, setNavigated] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const focusPrimary = useCallback(() => primaryRef.current?.focus(), []);
  const [changingGym, setChangingGym] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  // Clamped: a removed Wing-It card can shorten the list under the index.
  const index = Math.min(rawIndex, Math.max(0, exercises.length - 1));
  const current = exercises[index];
  const canFinish = exercises.some((e) => e.sets.some((s) => s.saved));
  const unfinished = exercises
    .filter((e) => !e.skipped)
    .map((e) => {
      const done = e.sets.filter((s) => s.saved && !s.extra).length;
      // Open-ended: nothing is short of a plan; one with no sets is listed
      // so the lifter knows it is recorded as not done.
      const planned = e.openEnded ? (done === 0 ? 1 : done) : e.plannedSets;
      return { name: e.performedExerciseName, done, planned };
    })
    .filter((e) => e.done < e.planned);
  const isLast = index >= exercises.length - 1;
  const next = exercises[index + 1];

  function go(to: number) {
    setNavigated(true);
    setIndex(Math.min(exercises.length - 1, Math.max(0, to)));
  }

  function requestFinish() {
    if (unfinished.length > 0) setConfirming(true);
    else finish();
  }

  function finish() {
    setConfirming(false);
    setError(null);
    startTransition(async () => {
      const res = await completeWorkoutAction({
        loggedSessionId: workout.loggedSessionId,
      });
      if (res.ok) router.push("/");
      else setError(res.error.message);
    });
  }

  return (
    <section className="space-y-3">
      {/* Planned recovery for the whole workout, every plan (Pitch 21g
          parity, OVE-230: the iPhone's workout screen shows it too). */}
      {workout.scheduledDeloadWeek ? <ScheduledDeloadBanner /> : null}
      <div className="flex items-center justify-between text-sm">
        <Link href="/" className="flex items-center text-muted-foreground">
          <ChevronLeft className="size-4" /> {workout.sessionName}
        </Link>
        {exercises.length > 0 ? (
          <span className="tabular-nums text-muted-foreground">
            {index + 1} / {exercises.length}
          </span>
        ) : null}
      </div>

      {workout.isHistoricalDate ? (
        <p className="text-xs text-muted-foreground">
          Logging {workout.scheduledFor} (a past day).
        </p>
      ) : null}

      {workout.gymName ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{workout.gymName}</span>
          {!workout.gymLocked ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-11"
              onClick={() => setChangingGym((v) => !v)}
            >
              Change gym
            </Button>
          ) : null}
        </div>
      ) : null}

      {changingGym && !workout.gymLocked ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <GymPicker
            mode="change"
            loggedSessionId={workout.loggedSessionId}
            gyms={activeGyms}
            confirmLabel="Save gym"
            onDone={() => setChangingGym(false)}
          />
        </div>
      ) : null}

      {current ? (
        <ExerciseCard
          // Key by occurrence so draft state (typed weights/reps) never leaks
          // across exercises when stepping Next/Previous.
          key={current.loggedExerciseId}
          exercise={current}
          gymLocked={workout.gymLocked}
          progression={progression[current.loggedExerciseId]}
          workoutDateIso={workout.scheduledFor}
          workoutName={workout.sessionName}
          scheduledDeloadWeek={workout.scheduledDeloadWeek}
          focusOnMount={navigated}
          onPlannedSetsDone={focusPrimary}
          swapSlot={
            // A Wing-It exercise is removed and re-added, never swapped.
            current.openEnded ? null : current.sets.some((s) => s.saved) ? (
              <Button variant="secondary" className="w-full" disabled>
                Swap exercise · locked (sets logged)
              </Button>
            ) : (
              <Button asChild variant="secondary" className="w-full">
                <Link
                  href={`/log/${workout.loggedSessionId}/${current.loggedExerciseId}/swap`}
                >
                  Swap exercise
                </Link>
              </Button>
            )
          }
        />
      ) : wingIt ? (
        // Pitch 25 (design §6.7): a Wing-It workout starts with no exercises.
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="font-medium">{WING_IT_COPY.emptyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {WING_IT_COPY.emptyMessage}
          </p>
          <Button asChild className="mt-4 h-11">
            <Link href={`/log/${workout.loggedSessionId}/add`}>
              <Plus aria-hidden /> {WING_IT_COPY.addExercise}
            </Link>
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          className="h-11"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          Previous
        </Button>
        {!isLast ? (
          <Button
            ref={primaryRef}
            className="h-11 min-w-0 flex-1"
            onClick={() => go(index + 1)}
          >
            <span className="truncate">
              Next: {next?.performedExerciseName}
            </span>
          </Button>
        ) : (
          <Button
            ref={primaryRef}
            className="h-11 flex-1"
            disabled={!canFinish || pending}
            onClick={requestFinish}
          >
            Finish workout
          </Button>
        )}
      </div>
      {wingIt && exercises.length > 0 ? (
        // Pitch 25: an exercise can be added at any time (design §6.7).
        <Button asChild variant="secondary" className="h-11 w-full">
          <Link href={`/log/${workout.loggedSessionId}/add`}>
            <Plus aria-hidden /> {WING_IT_COPY.addExercise}
          </Link>
        </Button>
      ) : null}
      {wingIt && !canFinish ? (
        // Pitch 25: a Wing-It workout starts empty, so say why Finish waits.
        <p className="text-center text-xs text-muted-foreground">
          Log at least one set before finishing.
        </p>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>
              Finish with unfinished exercises?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Exercises with no sets are recorded as not done; partly logged
              ones keep what you logged. Only exercises with every planned set
              count toward progression and goals.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-sm tabular-nums">
            {unfinished.map((e) => (
              <li key={e.name} className="flex justify-between gap-2">
                <span>{e.name}</span>
                <span className="text-muted-foreground">
                  {e.done === 0 ? "not done" : `${e.done} of ${e.planned} sets`}
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Keep logging
            </AlertDialogCancel>
            <Button onClick={finish} disabled={pending}>
              {pending ? "Finishing…" : "Finish workout"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
