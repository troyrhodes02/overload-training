"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  createGoalAction,
  type GoalFormState,
} from "@/app/(app)/goals/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseGoalInput } from "@/lib/goals/validation";

type Field = "gymId" | "targetWeightLbs" | "targetReps";
const FIELD_ORDER: Field[] = ["gymId", "targetWeightLbs", "targetReps"];

const GYM_REQUIRED = "Choose the gym this goal is measured at.";

/**
 * The goal target form (design Screen 3). Gym (machine/cable only), target
 * weight, target reps — nothing else exists to fill in. The numbers start
 * BLANK, always: Overload never proposes a target (R35, R36). Validation runs
 * inline and again on the server; typed values survive a failed save.
 */
export function GoalTargetForm({
  exerciseId,
  gymVariable,
  gyms,
  defaultGymId,
}: {
  exerciseId: string;
  gymVariable: boolean;
  gyms: { id: string; name: string }[];
  defaultGymId: string | null;
}) {
  const initial: GoalFormState = {
    result: null,
    values: {
      exerciseId,
      gymId: defaultGymId ?? "",
      targetWeightLbs: "",
      targetReps: "",
    },
  };
  const [state, formAction, isPending] = useActionState(
    createGoalAction,
    initial,
  );
  const [gymId, setGymId] = useState(state.values.gymId);
  const [weight, setWeight] = useState(state.values.targetWeightLbs);
  const [reps, setReps] = useState(state.values.targetReps);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const refs = useRef<Partial<Record<Field, HTMLElement | null>>>({});

  const failed = state.result && !state.result.ok ? state.result.error : null;
  const serverErrors = failed?.details ?? {};
  const errors: Record<string, string> = { ...serverErrors, ...clientErrors };
  const conflictGoalId =
    failed?.code === "conflict" ? failed.details?.existingGoalId : undefined;

  // An unexpected failure (no field details) keeps the numbers and says so.
  useEffect(() => {
    if (failed && !failed.details) {
      toast.error(failed.message, { duration: Infinity });
    }
  }, [failed]);

  function clear(field: Field) {
    setClientErrors((e) => {
      if (!(field in e)) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  }

  // Submitted manually (not via `<form action>`) so React's post-action form
  // reset can't clear the Radix Select (same reason as CustomExerciseForm).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseGoalInput({
      exerciseId,
      gymId,
      targetWeightLbs: weight,
      targetReps: reps,
    });
    const details: Record<string, string> = parsed.ok
      ? {}
      : { ...parsed.details };
    if (gymVariable && !gymId) details.gymId = GYM_REQUIRED;
    if (Object.keys(details).length > 0) {
      setClientErrors(details);
      const first = FIELD_ORDER.find((f) => details[f]);
      if (first) refs.current[first]?.focus();
      return;
    }
    setClientErrors({});
    startTransition(() => formAction(new FormData(event.currentTarget)));
  }

  const describedBy = (field: Field) =>
    errors[field] ? `${field}-error` : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <input type="hidden" name="exerciseId" value={exerciseId} />

      {conflictGoalId ? (
        <Alert role="alert">
          <AlertDescription className="space-y-3">
            <p>{failed?.message}</p>
            <Button asChild variant="outline" className="h-11">
              <Link href={`/goals/${conflictGoalId}`}>View goal</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {gymVariable ? (
        <div className="space-y-2">
          <Label id="gymId-label">Gym</Label>
          <Select
            name="gymId"
            value={gymId}
            onValueChange={(v) => {
              setGymId(v);
              clear("gymId");
            }}
          >
            <SelectTrigger
              className="h-11 w-full"
              aria-labelledby="gymId-label"
              aria-invalid={Boolean(errors.gymId)}
              aria-describedby={`gymId-help${errors.gymId ? " gymId-error" : ""}`}
              ref={(el) => {
                refs.current.gymId = el;
              }}
            >
              <SelectValue placeholder="Choose a gym" />
            </SelectTrigger>
            <SelectContent>
              {gyms.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="gymId-help" className="text-xs text-muted-foreground">
            Machine weights differ by gym, so this goal counts sessions at this
            gym only.
          </p>
          <FieldError id="gymId-error" message={errors.gymId} />
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Target</legend>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Label htmlFor="targetWeightLbs" className="sr-only">
              Target weight in pounds
            </Label>
            <Input
              id="targetWeightLbs"
              name="targetWeightLbs"
              inputMode="decimal"
              autoComplete="off"
              className="h-11 pr-9 text-base tabular-nums"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
                clear("targetWeightLbs");
              }}
              aria-invalid={Boolean(errors.targetWeightLbs)}
              aria-describedby={describedBy("targetWeightLbs")}
              ref={(el) => {
                refs.current.targetWeightLbs = el;
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
            >
              lb
            </span>
          </div>
          <span aria-hidden className="text-muted-foreground">
            ×
          </span>
          <div className="relative flex-1">
            <Label htmlFor="targetReps" className="sr-only">
              Target reps
            </Label>
            <Input
              id="targetReps"
              name="targetReps"
              inputMode="numeric"
              autoComplete="off"
              className="h-11 pr-12 text-base tabular-nums"
              value={reps}
              onChange={(e) => {
                setReps(e.target.value);
                clear("targetReps");
              }}
              aria-invalid={Boolean(errors.targetReps)}
              aria-describedby={describedBy("targetReps")}
              ref={(el) => {
                refs.current.targetReps = el;
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
            >
              reps
            </span>
          </div>
        </div>
        <FieldError
          id="targetWeightLbs-error"
          message={errors.targetWeightLbs}
        />
        <FieldError id="targetReps-error" message={errors.targetReps} />
        <FieldError id="exerciseId-error" message={errors.exerciseId} />
      </fieldset>

      {!gymVariable ? (
        <p className="text-xs text-muted-foreground">
          Counts your best session at any gym.
        </p>
      ) : null}

      {/* Thumb-reach primary action on phones (above the bottom nav); inline at md+. */}
      <div className="fixed inset-x-0 bottom-16 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" className="h-11 w-full" disabled={isPending}>
          {isPending ? "Setting goal…" : "Set goal"}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
