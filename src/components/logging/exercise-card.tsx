"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  logSetAction,
  setExerciseSkippedAction,
} from "@/app/(app)/log/actions";
import { EditSetDialog } from "@/components/logging/edit-set-dialog";
import type { ExerciseCardDto } from "@/lib/logging/queries";
import {
  activeSetNumber,
  formatPreviousPerformance,
  formatWeight,
  loggedRowLabel,
  offerCaption,
  offerFor,
} from "@/lib/logging/set-entry";
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
 * Guided per-exercise logging card (Guided Workout Logging Screen 4, refined
 * by Faster Logging UX — design doc v1.1, preview §01–§06, spec §7).
 *
 * "A box is a draft; a plain number is history": logged sets render as text
 * from the server's records only; the one ACTIVE set (the next planned one)
 * is the only row with inputs. Its weight box holds an offer — the working
 * weight for the first set, then the weight of the set just logged — that is
 * local state and is never written on its own; reps are never offered. Only a
 * Log set press (or Enter in reps) calls logSetAction, and a row turns logged
 * only once the refreshed record contains it (R4–R7, R15).
 *
 * A bodyweight exercise (requiresExternalWeight false) has no weight input at
 * all — reps only, and no weight is sent. A client island calling server
 * actions; it never touches the database.
 */
type Draft = { weight: string | null; reps: string };
type FieldError = { message: string; field: "weight" | "reps" };
/** Where focus should go once the next render shows the confirmed set (R13). */
type FocusIntent =
  | { kind: "none" }
  | { kind: "mount" }
  | { kind: "after-log"; setNumber: number };

export function ExerciseCard({
  exercise,
  gymLocked,
  swapSlot,
  progression,
  workoutDateIso,
  focusOnMount = false,
  onPlannedSetsDone,
}: {
  exercise: ExerciseCardDto;
  gymLocked: boolean;
  /** Swap control is provided by a later ticket (OVE-23); slot in if present. */
  swapSlot?: React.ReactNode;
  /** Derived progression for this occurrence (OVE-28); omitted → no tag/suggestion. */
  progression?: CardProgression;
  /** The workout's date: the "Last time" line adds a year only when it differs. */
  workoutDateIso?: string;
  /** True only when the lifter moved here with Next/Previous — never on page load. */
  focusOnMount?: boolean;
  /** Called once a confirmed set leaves nothing to log, so the runner can focus Next. */
  onPlannedSetsDone?: () => void;
}) {
  const router = useRouter();
  const needsWeight = exercise.requiresExternalWeight;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [errors, setErrors] = useState<Record<number, FieldError>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingSet, setPendingSet] = useState<number | null>(null);
  const [extraRow, setExtraRow] = useState<number | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);
  const [skipping, startSkip] = useTransition();
  const [, startTransition] = useTransition();
  const weightRef = useRef<HTMLInputElement>(null);
  const repsRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusIntent = useRef<FocusIntent>(
    focusOnMount ? { kind: "mount" } : { kind: "none" },
  );

  const anySaved = exercise.sets.some((s) => s.saved);
  const plannedDone = exercise.sets
    .filter((s) => !s.extra)
    .every((s) => s.saved);
  const pendingExtra =
    extraRow !== null && !exercise.sets.some((s) => s.setNumber === extraRow)
      ? extraRow
      : null;
  const active = activeSetNumber(
    exercise.sets,
    exercise.plannedSets,
    pendingExtra,
  );
  const offer = offerFor({
    requiresExternalWeight: needsWeight,
    sets: exercise.sets,
    workingWeightLbs: exercise.suggestedWeightLbs,
  });
  const draft: Draft =
    active !== null
      ? (drafts[active] ?? { weight: null, reps: "" })
      : { weight: null, reps: "" };
  // An untouched box always shows the current offer; a typed one stays theirs.
  const weightValue =
    draft.weight ?? (offer ? formatWeight(offer.weightLbs) : "");
  const showCaption = needsWeight && draft.weight === null && offer !== null;
  const loggedSetNumbers = exercise.sets
    .filter((s) => s.saved)
    .map((s) => s.setNumber)
    .join(",");

  // Focus only ever follows the lifter's own action (R13): after a confirmed
  // set (once the refreshed record shows it), or after Next/Previous.
  useLayoutEffect(() => {
    const intent = focusIntent.current;
    if (intent.kind === "none") return;
    if (
      intent.kind === "after-log" &&
      !exercise.sets.some((s) => s.setNumber === intent.setNumber && s.saved)
    ) {
      return; // the write's refresh hasn't arrived yet
    }
    focusIntent.current = { kind: "none" };
    if (active !== null) {
      const weightEmpty = needsWeight && weightValue === "";
      (weightEmpty ? weightRef : repsRef).current?.focus();
    } else if (intent.kind === "after-log") {
      onPlannedSetsDone?.();
    } else {
      headingRef.current?.focus();
    }
  }, [
    active,
    loggedSetNumbers,
    exercise.sets,
    needsWeight,
    weightValue,
    onPlannedSetsDone,
  ]);

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
  const rows = [
    ...exercise.sets,
    ...(pendingExtra !== null
      ? [
          {
            setNumber: pendingExtra,
            loggedSetId: null,
            weightLbs: null,
            reps: null,
            saved: false,
            extra: true,
          },
        ]
      : []),
  ];
  const contextLine = formatPreviousPerformance({
    previous: exercise.previousPerformance,
    isGymVariable: exercise.isGymVariable,
    gymName: exercise.gymName,
    referenceIso: workoutDateIso ?? exercise.previousPerformance?.dateIso ?? "",
  });

  function addExtraSet() {
    const next = Math.max(...exercise.sets.map((s) => s.setNumber)) + 1;
    focusIntent.current = { kind: "mount" };
    setExtraRow(next);
  }

  function setDraft(n: number, patch: Partial<Draft>) {
    setDrafts((d) => ({
      ...d,
      [n]: { ...(d[n] ?? { weight: null, reps: "" }), ...patch },
    }));
  }

  function fail(n: number, error: FieldError) {
    setErrors((e) => ({ ...e, [n]: error }));
    (error.field === "weight" ? weightRef : repsRef).current?.focus();
  }

  function confirm(n: number) {
    if (pendingSet !== null) return;
    const weight = Number(weightValue);
    const reps = Number(draft.reps);
    if (
      needsWeight &&
      (!weightValue || !Number.isFinite(weight) || weight <= 0)
    ) {
      fail(n, { message: "Enter a weight above 0.", field: "weight" });
      return;
    }
    if (!draft.reps || !Number.isInteger(reps) || reps <= 0) {
      fail(n, { message: "Enter reps above 0.", field: "reps" });
      return;
    }
    setErrors((e) => {
      const rest = { ...e };
      delete rest[n];
      return rest;
    });
    setNotice(null);
    setPendingSet(n);
    startTransition(async () => {
      const res = await logSetAction({
        loggedExerciseId: exercise.loggedExerciseId,
        setNumber: n,
        weightLbs: needsWeight ? weight : null,
        reps,
      });
      setPendingSet(null);
      if (res.ok) {
        focusIntent.current = { kind: "after-log", setNumber: n };
        router.refresh();
        return;
      }
      if (res.error.code === "conflict") {
        // Logged elsewhere: show the server's record instead of the draft.
        setNotice(res.error.message);
        router.refresh();
        return;
      }
      const details = res.error.details;
      if (details?.weightLbs) {
        fail(n, { message: details.weightLbs, field: "weight" });
      } else if (details?.reps) {
        fail(n, { message: details.reps, field: "reps" });
      } else {
        fail(n, { message: res.error.message, field: "reps" });
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-medium outline-none"
          >
            {exercise.performedExerciseName}
          </h2>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {exercise.plannedSets} × {exercise.plannedRepRange.min}–
            {exercise.plannedRepRange.max}
            {!needsWeight ? " · bodyweight, reps only" : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {progression?.tag ? <ProgressTag state={progression.tag} /> : null}
          {exercise.isGymVariable && exercise.gymName ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {exercise.gymName}
              {gymLocked ? <Lock className="size-3" /> : null}
            </span>
          ) : null}
        </div>
      </div>
      <p
        className="truncate text-sm tabular-nums text-muted-foreground"
        title={contextLine}
      >
        {contextLine}
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

      <div className="mt-4 space-y-1 tabular-nums">
        {rows.map((s) => {
          if (s.saved && s.loggedSetId && s.reps !== null) {
            return (
              <EditSetDialog
                key={s.setNumber}
                loggedSetId={s.loggedSetId}
                setNumber={s.setNumber}
                exerciseName={exercise.performedExerciseName}
                requiresExternalWeight={needsWeight}
                weightLbs={s.weightLbs}
                reps={s.reps}
                trigger={
                  <button
                    type="button"
                    aria-label={loggedRowLabel({
                      setNumber: s.setNumber,
                      weightLbs: s.weightLbs,
                      reps: s.reps,
                    })}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SetLabel setNumber={s.setNumber} extra={s.extra} />
                    <span className="flex-1 text-base text-foreground">
                      {s.weightLbs === null ? (
                        <>
                          {s.reps}{" "}
                          <span className="text-sm text-muted-foreground">
                            reps
                          </span>
                        </>
                      ) : (
                        <>
                          {formatWeight(s.weightLbs)}{" "}
                          <span className="text-sm text-muted-foreground">
                            lbs
                          </span>{" "}
                          × {s.reps}
                        </>
                      )}
                    </span>
                    <Check aria-hidden className="size-4 text-primary" />
                  </button>
                }
              />
            );
          }

          if (s.setNumber !== active) {
            return (
              <div
                key={s.setNumber}
                className="flex min-h-9 items-center gap-3 px-2 text-sm text-muted-foreground"
              >
                <SetLabel setNumber={s.setNumber} extra={s.extra} />
                <span aria-hidden>—</span>
                <span className="sr-only">not logged yet</span>
              </div>
            );
          }

          const err = errors[s.setNumber];
          const saving = pendingSet === s.setNumber;
          const captionId = `${exercise.loggedExerciseId}-${s.setNumber}-offer`;
          const errorId = `${exercise.loggedExerciseId}-${s.setNumber}-error`;
          return (
            <form
              key={s.setNumber}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                confirm(s.setNumber);
              }}
              className="space-y-1.5 rounded-md border-l-2 border-primary bg-muted/40 p-2"
            >
              <p className="text-sm text-muted-foreground">
                Set {s.setNumber}
                {s.extra ? " · extra" : ""}
              </p>
              <div className="flex items-center gap-2">
                {needsWeight ? (
                  <div className="relative min-w-0 flex-1">
                    <Input
                      ref={weightRef}
                      aria-label={`Set ${s.setNumber} weight in pounds`}
                      aria-describedby={
                        [showCaption ? captionId : "", err ? errorId : ""]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      aria-invalid={err?.field === "weight" || undefined}
                      inputMode="decimal"
                      enterKeyHint="next"
                      autoComplete="off"
                      className="h-12 pr-8 text-lg font-medium tracking-tight md:text-lg"
                      value={weightValue}
                      disabled={saving}
                      onFocus={(e) => {
                        // An offered weight is selected, so typing replaces it.
                        if (draft.weight !== null) return;
                        const el = e.currentTarget;
                        el.select();
                        requestAnimationFrame(() => {
                          if (document.activeElement === el) el.select();
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          repsRef.current?.focus();
                        }
                      }}
                      onChange={(e) =>
                        setDraft(s.setNumber, { weight: e.target.value })
                      }
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
                    >
                      lbs
                    </span>
                  </div>
                ) : null}
                <div
                  className={
                    needsWeight
                      ? "relative w-[5.5rem] shrink-0"
                      : "relative flex-1"
                  }
                >
                  <Input
                    ref={repsRef}
                    aria-label={`Set ${s.setNumber} reps`}
                    aria-describedby={err ? errorId : undefined}
                    aria-invalid={err?.field === "reps" || undefined}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    enterKeyHint="done"
                    autoComplete="off"
                    className="h-12 pr-11 text-lg font-medium tracking-tight md:text-lg"
                    value={draft.reps}
                    disabled={saving}
                    onChange={(e) =>
                      setDraft(s.setNumber, { reps: e.target.value })
                    }
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
                  >
                    reps
                  </span>
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="shrink-0 gap-1.5 px-3 max-[359px]:w-11 max-[359px]:px-0"
                  aria-label={`Log set ${s.setNumber}`}
                  disabled={saving}
                  // Keep focus (and the phone keyboard) in the field (R13).
                  onPointerDown={(e) => e.preventDefault()}
                >
                  {saving ? (
                    "Saving…"
                  ) : (
                    <>
                      <Check aria-hidden />
                      {/* Below 360px the check alone carries it (aria-label names it). */}
                      <span className="max-[359px]:sr-only">Log set</span>
                    </>
                  )}
                </Button>
              </div>
              {showCaption && offer ? (
                <p
                  id={captionId}
                  className="pl-0.5 text-xs text-muted-foreground"
                >
                  {offerCaption(offer)}
                </p>
              ) : null}
              {err ? (
                <p
                  id={errorId}
                  role="alert"
                  className="pl-0.5 text-xs text-destructive"
                >
                  {err.message}
                </p>
              ) : null}
            </form>
          );
        })}
      </div>

      {notice ? (
        <p role="alert" className="mt-2 px-2 text-xs text-destructive">
          {notice}
        </p>
      ) : null}

      {plannedDone && pendingExtra === null ? (
        <>
          <p className="ml-2 mt-2 text-sm text-muted-foreground">
            All {exercise.plannedSets} sets logged.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 h-11 w-full"
            onClick={addExtraSet}
          >
            <Plus aria-hidden />
            Add set
          </Button>
        </>
      ) : null}

      {progression?.hasTrend ? (
        <div className="mt-1">
          <Link
            href={`/exercises/${exercise.performedExerciseId}`}
            className="inline-flex min-h-11 items-center text-sm text-primary"
          >
            View trend ›
          </Link>
        </div>
      ) : null}

      {swapSlot ? <div className="mt-3">{swapSlot}</div> : null}
      {skipControl}
    </div>
  );
}

function SetLabel({ setNumber, extra }: { setNumber: number; extra: boolean }) {
  return (
    <span className="w-12 shrink-0 text-sm text-muted-foreground">
      Set {setNumber}
      {extra ? (
        <span className="block text-[10px] leading-none">extra</span>
      ) : null}
    </span>
  );
}
