"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  logSetAction,
  setExerciseSkippedAction,
} from "@/app/(app)/log/actions";
import type { ExerciseCardDto } from "@/lib/logging/queries";
import type { ProgressionTag, SuggestedLoadDto } from "@/lib/progression/types";
import { ProgressTag } from "@/components/progression/progress-tag";
import { SuggestedLoad } from "@/components/progression/suggested-load";

/**
 * Derived progression shown beside the bar (OVE-28). Display-only: the tag never
 * becomes a control and the suggestion never pre-fills set entry. During a
 * scheduled-deload week the reactive tag is suppressed and only the 90% load
 * shows (R37).
 */
export type CardProgression = {
  tag: ProgressionTag | null;
  suggestion: SuggestedLoadDto;
  scheduledDeloadWeek: boolean;
  hasTrend: boolean;
};

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
  progression,
}: {
  exercise: ExerciseCardDto;
  gymLocked: boolean;
  /** Swap control is provided by a later ticket (OVE-23); slot in if present. */
  swapSlot?: React.ReactNode;
  /** Derived progression for this occurrence (OVE-28); omitted → no tag/suggestion. */
  progression?: CardProgression;
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
  const [extraRow, setExtraRow] = useState<number | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);
  const [skipping, startSkip] = useTransition();
  const [, startTransition] = useTransition();

  const anySaved = exercise.sets.some((s) => s.saved);
  const plannedDone = exercise.sets
    .filter((s) => !s.extra)
    .every((s) => s.saved);

  function markSkipped(skipped: boolean) {
    setSkipError(null);
    startSkip(async () => {
      const res = await setExerciseSkippedAction({
        loggedExerciseId: exercise.loggedExerciseId,
        skipped,
      });
      if (res.ok) router.refresh();
      else setSkipError(res.error.message);
    });
  }

  const skipControl = !anySaved ? (
    <div className="mt-3 space-y-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-11 w-full text-muted-foreground"
        disabled={skipping}
        onClick={() => markSkipped(true)}
      >
        Didn&apos;t do this exercise
      </Button>
      {skipError ? (
        <p role="alert" className="text-xs text-destructive">
          {skipError}
        </p>
      ) : null}
    </div>
  ) : null;

  if (exercise.skipped) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-medium text-muted-foreground">
          {exercise.performedExerciseName}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Not done today. It won&apos;t count toward progression.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 h-11"
          disabled={skipping}
          onClick={() => markSkipped(false)}
        >
          Undo — I&apos;ll log it
        </Button>
        {skipError ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {skipError}
          </p>
        ) : null}
      </div>
    );
  }

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
        {skipControl}
      </div>
    );
  }

  // Rows: the planned sets, any logged extras, and one pending extra row.
  const lastSaved = [...exercise.sets].reverse().find((s) => s.saved);
  const pendingExtra =
    extraRow !== null && !exercise.sets.some((s) => s.setNumber === extraRow)
      ? extraRow
      : null;
  const rows = [
    ...exercise.sets,
    ...(pendingExtra !== null
      ? [
          {
            setNumber: pendingExtra,
            weightLbs: null,
            reps: null,
            saved: false,
            extra: true,
          },
        ]
      : []),
  ];

  function addExtraSet() {
    const next = Math.max(...exercise.sets.map((s) => s.setNumber)) + 1;
    setDrafts((d) => ({
      ...d,
      [next]: { weight: lastSaved?.weightLbs?.toString() ?? "", reps: "" },
    }));
    setExtraRow(next);
  }

  function setDraft(n: number, patch: Partial<Draft>) {
    setDrafts((d) => ({
      ...d,
      [n]: { ...(d[n] ?? { weight: "", reps: "" }), ...patch },
    }));
  }

  function save(n: number) {
    const draft = drafts[n] ?? { weight: "", reps: "" };
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
          {progression?.scheduledDeloadWeek ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Deload week — recovery, not a verdict.
            </p>
          ) : progression?.tag === "stalled" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Rep target met, but e1RM flat across recent sessions — holding.
            </p>
          ) : null}
          {progression?.suggestion ? (
            <p className="mt-1">
              <SuggestedLoad suggestion={progression.suggestion} />
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          {progression?.tag ? <ProgressTag state={progression.tag} /> : null}
          {exercise.isGymVariable && exercise.gymName ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {exercise.gymName}
              {gymLocked ? <Lock className="size-3" /> : null}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3 tabular-nums">
        {rows.map((s) => {
          const draft = drafts[s.setNumber] ?? {
            weight: s.weightLbs?.toString() ?? "",
            reps: s.reps?.toString() ?? "",
          };
          const err = errors[s.setNumber];
          return (
            <div key={s.setNumber} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-12 text-sm text-muted-foreground">
                  Set {s.setNumber}
                  {s.extra ? (
                    <span className="block text-[10px] leading-none">
                      extra
                    </span>
                  ) : null}
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
                  <Check className="size-4 text-primary" aria-label="Saved" />
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

      {plannedDone && pendingExtra === null ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 h-11 w-full"
          onClick={addExtraSet}
        >
          <Plus aria-hidden />
          Add set
        </Button>
      ) : null}

      {progression?.hasTrend ? (
        <div className="mt-3">
          <Link
            href={`/exercises/${exercise.performedExerciseId}`}
            className="text-sm text-primary"
          >
            View trend ›
          </Link>
        </div>
      ) : null}

      {swapSlot ? <div className="mt-4">{swapSlot}</div> : null}
      {skipControl}
    </div>
  );
}
