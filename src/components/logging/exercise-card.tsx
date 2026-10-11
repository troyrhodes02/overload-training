"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logSetAction } from "@/app/(app)/log/actions";
import type { ExerciseCardDto } from "@/lib/logging/queries";

/**
 * Guided per-exercise logging card (design Screen 4). All planned working-set
 * rows together; weight + reps entry with positive-only validation; a saved set
 * reads as settled, an unsaved row as draft, and a failed save keeps the numbers.
 * A client island calling logSetAction; it never touches the database.
 */
type Draft = { weight: string; reps: string };

export function ExerciseCard({
  exercise,
  gymLocked,
  swapSlot,
}: {
  exercise: ExerciseCardDto;
  gymLocked: boolean;
  /** Swap control is provided by a later ticket (OVE-23); slot in if present. */
  swapSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(
      exercise.sets.map((s) => [
        s.setNumber,
        {
          weight:
            s.weightLbs?.toString() ??
            exercise.suggestedWeightLbs?.toString() ??
            "",
          reps: s.reps?.toString() ?? "",
        },
      ]),
    ),
  );
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [pendingSet, setPendingSet] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  if (exercise.performedArchived) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-medium">{exercise.performedExerciseName}</p>
        <p className="mt-1 text-sm text-destructive">
          Unavailable — choose a substitute
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          This planned exercise was archived. Pick a same-muscle substitute to
          complete it. The plan is not changed.
        </p>
        {swapSlot ? <div className="mt-4">{swapSlot}</div> : null}
      </div>
    );
  }

  function setDraft(n: number, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [n]: { ...d[n], ...patch } }));
  }

  function save(n: number) {
    const draft = drafts[n];
    const weight = Number(draft.weight);
    const reps = Number(draft.reps);
    if (!draft.weight || !Number.isFinite(weight) || weight <= 0) {
      setErrors((e) => ({ ...e, [n]: "Enter a weight above 0." }));
      return;
    }
    if (!draft.reps || !Number.isInteger(reps) || reps <= 0) {
      setErrors((e) => ({ ...e, [n]: "Enter reps above 0." }));
      return;
    }
    setErrors((e) => ({ ...e, [n]: "" }));
    setPendingSet(n);
    startTransition(async () => {
      const res = await logSetAction({
        loggedExerciseId: exercise.loggedExerciseId,
        setNumber: n,
        weightLbs: weight,
        reps,
      });
      setPendingSet(null);
      if (res.ok) router.refresh();
      else setErrors((e) => ({ ...e, [n]: res.error.message }));
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{exercise.performedExerciseName}</p>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {exercise.plannedSets} × {exercise.plannedRepRange.min}–
            {exercise.plannedRepRange.max}
            {exercise.suggestedWeightLbs
              ? ` · last: ${exercise.suggestedWeightLbs} lbs`
              : ""}
          </p>
          {exercise.swapped ? (
            <p className="text-xs text-muted-foreground">
              Swapped from {exercise.plannedExerciseName}
            </p>
          ) : null}
        </div>
        {exercise.isGymVariable && exercise.gymName ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {exercise.gymName}
            {gymLocked ? <Lock className="size-3" /> : null}
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-3 tabular-nums">
        {exercise.sets.map((s) => {
          const draft = drafts[s.setNumber];
          const err = errors[s.setNumber];
          return (
            <div key={s.setNumber} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-12 text-sm text-muted-foreground">
                  Set {s.setNumber}
                </span>
                <Input
                  aria-label={`Set ${s.setNumber} weight in pounds`}
                  inputMode="decimal"
                  className="h-11 flex-1"
                  value={draft.weight}
                  disabled={s.saved}
                  onChange={(e) =>
                    setDraft(s.setNumber, { weight: e.target.value })
                  }
                />
                <span className="text-sm text-muted-foreground">lbs</span>
                <Input
                  aria-label={`Set ${s.setNumber} reps`}
                  inputMode="numeric"
                  className="h-11 w-20"
                  value={draft.reps}
                  disabled={s.saved}
                  onChange={(e) =>
                    setDraft(s.setNumber, { reps: e.target.value })
                  }
                />
                <span className="text-sm text-muted-foreground">reps</span>
                {s.saved ? (
                  <Check
                    className="size-4 text-muted-foreground"
                    aria-label="Saved"
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pendingSet === s.setNumber}
                    onClick={() => save(s.setNumber)}
                  >
                    Save
                  </Button>
                )}
              </div>
              {err ? (
                <p role="alert" className="pl-14 text-xs text-destructive">
                  {err}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {swapSlot ? <div className="mt-4">{swapSlot}</div> : null}
    </div>
  );
}
