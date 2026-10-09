"use client";

import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import type {
  MesocycleFormState,
  MesocycleFormValues,
} from "@/app/(app)/plan/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StickyActions } from "@/components/plan/plan-bits";
import {
  DAYS_OF_WEEK,
  formatPlanDate,
  parseIsoDate,
  plannedEndDate,
} from "@/lib/plan/calendar";
import {
  PRESET_STRUCTURES,
  SPLIT_TYPES,
  SPLIT_TYPE_LABELS,
} from "@/lib/plan/presets";
import {
  deloadOutOfRangeMessage,
  LENGTH_WEEKS_MAX,
  parseMesocycleDetails,
  parseSplitType,
  PLAN_NAME_MAX,
} from "@/lib/plan/validation";
import { cn } from "@/lib/utils";

type Variant = "create" | "clone" | "details";

function without(errors: Record<string, string>, key: string) {
  const next = { ...errors };
  delete next[key];
  return next;
}

/**
 * Name, start date, length, deload week (+ structure when creating). Used by
 * New mesocycle, Clone setup, and Edit details. Defaults arrive as editable
 * values; nothing is inferred (a new block has no start date until he picks
 * one). A deload week past the end is shown, never silently moved.
 */
export function MesocycleForm({
  action,
  initial,
  variant,
  submitLabel,
  pendingLabel,
  startHelp = "Week 1 begins on this date.",
  cancelHref,
  children,
}: {
  action: (
    prev: MesocycleFormState,
    formData: FormData,
  ) => Promise<MesocycleFormState>;
  initial: MesocycleFormValues;
  variant: Variant;
  submitLabel: string;
  pendingLabel: string;
  startHelp?: string;
  cancelHref?: string;
  /** Extra content above the submit (e.g. what a clone carries over). */
  children?: ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, {
    result: null,
    values: initial,
  });
  const [startDate, setStartDate] = useState(state.values.startDate);
  const [lengthWeeks, setLengthWeeks] = useState(state.values.lengthWeeks);
  const [deloadWeek, setDeloadWeek] = useState(state.values.deloadWeek);
  const [splitType, setSplitType] = useState(state.values.splitType);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const serverDetails =
    state.result && !state.result.ok ? (state.result.error.details ?? {}) : {};
  const errors = { ...serverDetails, ...clientErrors };
  const failedUnexpectedly =
    state.result && !state.result.ok && !state.result.error.details;

  const lengthNum = /^\d+$/.test(lengthWeeks) ? Number(lengthWeeks) : null;
  const deloadNum = /^\d+$/.test(deloadWeek) ? Number(deloadWeek) : null;
  const deloadWarning =
    lengthNum && deloadNum && lengthNum >= 1
      ? deloadOutOfRangeMessage(deloadNum, lengthNum)
      : null;
  const endLine =
    startDate &&
    parseIsoDate(startDate) &&
    lengthNum &&
    lengthNum >= 1 &&
    lengthNum <= LENGTH_WEEKS_MAX // out-of-range input gets a field error, not a date
      ? `Ends ${formatPlanDate(plannedEndDate(startDate, lengthNum))}.`
      : null;

  // Submitted manually (not via `<form action>`) so React 19 does not reset
  // the form after a failed save: the entries stay exactly as typed.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = parseMesocycleDetails({
      name: data.get("name"),
      startDate: data.get("startDate"),
      lengthWeeks: data.get("lengthWeeks"),
      deloadWeek: data.get("deloadWeek"),
    });
    const next: Record<string, string> = parsed.ok ? {} : parsed.details;
    if (variant === "create") {
      const split = parseSplitType(data.get("splitType"));
      if (!split.ok) Object.assign(next, split.details);
    }
    setClientErrors(next);
    if (Object.keys(next).length > 0) {
      const first = Object.keys(next)[0];
      formRef.current
        ?.querySelector<HTMLElement>(`[data-field="${first}"]`)
        ?.focus();
      return;
    }
    startTransition(() => formAction(data));
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`${key}-error`} role="alert" className="text-sm text-destructive">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="m-name">Name</Label>
        <Input
          id="m-name"
          name="name"
          data-field="name"
          autoComplete="off"
          maxLength={PLAN_NAME_MAX}
          defaultValue={state.values.name}
          className="h-11"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
          onChange={() => setClientErrors((e) => without(e, "name"))}
        />
        {fieldError("name")}
      </div>

      <div className="space-y-2">
        <Label htmlFor="m-start">Start date</Label>
        <Input
          id="m-start"
          name="startDate"
          data-field="startDate"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-11"
          aria-invalid={Boolean(errors.startDate)}
          aria-describedby="m-start-help"
        />
        <p id="m-start-help" className="text-sm text-muted-foreground">
          {startHelp}
          {endLine && (
            <>
              <br />
              {endLine}
            </>
          )}
        </p>
        {fieldError("startDate")}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="m-length">Length</Label>
          <div className="flex items-center gap-2">
            <Input
              id="m-length"
              name="lengthWeeks"
              data-field="lengthWeeks"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={lengthWeeks}
              onChange={(e) => setLengthWeeks(e.target.value)}
              className="h-11 w-20 text-center text-base tabular-nums"
              aria-invalid={Boolean(errors.lengthWeeks)}
            />
            <span className="text-sm text-muted-foreground">weeks</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="m-deload">Deload week</Label>
          <Input
            id="m-deload"
            name="deloadWeek"
            data-field="deloadWeek"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={deloadWeek}
            onChange={(e) => setDeloadWeek(e.target.value)}
            className="h-11 w-20 text-center text-base tabular-nums"
            aria-invalid={Boolean(errors.deloadWeek || deloadWarning)}
            aria-describedby={deloadWarning ? "deload-warning" : undefined}
          />
        </div>
      </div>
      {fieldError("lengthWeeks")}
      {errors.deloadWeek
        ? fieldError("deloadWeek")
        : deloadWarning && (
            <p
              id="deload-warning"
              role="alert"
              className="-mt-3 text-sm text-destructive"
            >
              {deloadWarning}
            </p>
          )}

      {variant === "create" && (
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">Structure</legend>
          <input type="hidden" name="splitType" value={splitType} />
          <RadioGroup
            value={splitType}
            onValueChange={(v) => {
              setSplitType(v);
              setClientErrors((e) => without(e, "splitType"));
            }}
            aria-label="Structure"
            className="gap-3"
          >
            {SPLIT_TYPES.map((type) => {
              const structure = PRESET_STRUCTURES[type];
              const id = `split-${type}`;
              return (
                <Label
                  key={type}
                  htmlFor={id}
                  className={cn(
                    "block cursor-pointer rounded-lg border border-border bg-card p-4 leading-normal font-normal",
                    splitType === type && "ring-2 ring-primary",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <RadioGroupItem
                      id={id}
                      value={type}
                      data-field="splitType"
                    />
                    <span className="text-sm font-medium">
                      {SPLIT_TYPE_LABELS[type]}
                    </span>
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {structure.length === 0
                      ? "Start with an empty week."
                      : DAYS_OF_WEEK.map(
                          (d) =>
                            `${d.short} ${structure.find((s) => s.dayOfWeek === d.day)?.name ?? "Rest"}`,
                        ).join(" · ")}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
          {fieldError("splitType")}
          <p className="text-sm text-muted-foreground">
            Structure only. You choose every exercise, set count, and rep range.
          </p>
        </fieldset>
      )}

      {children}

      {failedUnexpectedly && state.result && !state.result.ok && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription>{state.result.error.message}</AlertDescription>
        </Alert>
      )}
      {state.result &&
        !state.result.ok &&
        state.result.error.details &&
        Object.keys(state.result.error.details).length > 0 &&
        Object.keys(clientErrors).length === 0 && (
          <p className="sr-only" role="status">
            {state.result.error.message}
          </p>
        )}

      <StickyActions>
        {cancelHref ? (
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="h-11">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <Button type="submit" className="h-11 flex-1" disabled={isPending}>
              {isPending ? pendingLabel : submitLabel}
            </Button>
          </div>
        ) : (
          <Button type="submit" className="h-11 w-full" disabled={isPending}>
            {isPending ? pendingLabel : submitLabel}
          </Button>
        )}
      </StickyActions>
    </form>
  );
}
