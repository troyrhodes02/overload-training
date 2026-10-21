"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
}: {
  workout: WorkoutDto;
  activeGyms: GymOption[];
  /** Derived per-occurrence progression, keyed by loggedExerciseId (OVE-28). */
  progression: Record<string, CardProgression>;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // True once the lifter has moved between cards; the first card never
  // takes focus on its own (R13).
  const [navigated, setNavigated] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const focusPrimary = useCallback(() => primaryRef.current?.focus(), []);
  const [changingGym, setChangingGym] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const exercises = workout.exercises;
  const current = exercises[index];
  const canFinish = exercises.some((e) => e.sets.some((s) => s.saved));
  const unfinished = exercises
    .filter((e) => !e.skipped)
    .map((e) => ({
      name: e.performedExerciseName,
      done: e.sets.filter((s) => s.saved && !s.extra).length,
      planned: e.plannedSets,
    }))
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
      <div className="flex items-center justify-between text-sm">
        <Link href="/" className="flex items-center text-muted-foreground">
          <ChevronLeft className="size-4" /> {workout.sessionName}
        </Link>
        <span className="tabular-nums text-muted-foreground">
          {index + 1} / {exercises.length}
        </span>
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
          focusOnMount={navigated}
          onPlannedSetsDone={focusPrimary}
          swapSlot={
            current.sets.some((s) => s.saved) ? (
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
