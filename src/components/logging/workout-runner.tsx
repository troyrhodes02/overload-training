"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExerciseCard } from "@/components/logging/exercise-card";
import { GymPicker, type GymOption } from "@/components/logging/gym-picker";
import { completeWorkoutAction } from "@/app/(app)/log/actions";
import type { WorkoutDto } from "@/lib/logging/queries";

/**
 * The workout runner (design Screen 4/6). Steps through the planned exercises,
 * one card at a time, and finishes the workout when every required exercise is
 * complete. Client island; completion is an explicit, server-validated action.
 */
export function WorkoutRunner({
  workout,
  activeGyms,
}: {
  workout: WorkoutDto;
  activeGyms: GymOption[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [changingGym, setChangingGym] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const exercises = workout.exercises;
  const current = exercises[index];
  const canFinish =
    exercises.length > 0 &&
    exercises.every(
      (e) => !e.performedArchived && e.sets.every((s) => s.saved),
    );
  const isLast = index >= exercises.length - 1;

  function finish() {
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
        <ExerciseCard exercise={current} gymLocked={workout.gymLocked} />
      ) : null}

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          Previous
        </Button>
        {!isLast ? (
          <Button
            className="flex-1"
            onClick={() =>
              setIndex((i) => Math.min(exercises.length - 1, i + 1))
            }
          >
            Next
          </Button>
        ) : (
          <Button
            className="flex-1"
            disabled={!canFinish || pending}
            onClick={finish}
          >
            Finish workout
          </Button>
        )}
      </div>
    </section>
  );
}
