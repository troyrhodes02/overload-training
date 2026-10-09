"use client";

import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  addSessionExerciseAction,
  removeSessionExerciseAction,
  updateSessionExerciseAction,
} from "@/app/(app)/plan/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parsePlannedExercise } from "@/lib/plan/validation";

export type ExerciseLabel = {
  name: string;
  primaryMuscleLabel: string;
  equipmentLabel: string;
  isArchived?: boolean;
};

type Mode =
  | { kind: "add"; sessionId: string; exerciseId: string; onAdded: () => void }
  | {
      kind: "edit";
      sessionExerciseId: string;
      sessionName: string;
      replaceHref: string;
      plannedSets: number;
      targetRepMin: number;
      targetRepMax: number;
    };

const FIELDS = ["plannedSets", "targetRepMin", "targetRepMax"] as const;
type Field = (typeof FIELDS)[number];

/**
 * Sets and a target rep range for one exercise in a session. Adding starts
 * EMPTY: Overload never suggests a prescription (spec D50). A range typed
 * backwards is an error, never silently swapped (spec D22). Editing also
 * offers Replace (the repair path for an archived exercise) and Remove.
 */
export function PlannedExerciseDialog({
  open,
  onOpenChange,
  exercise,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: ExerciseLabel;
  mode: Mode;
}) {
  const initial =
    mode.kind === "edit"
      ? {
          plannedSets: String(mode.plannedSets),
          targetRepMin: String(mode.targetRepMin),
          targetRepMax: String(mode.targetRepMax),
        }
      : { plannedSets: "", targetRepMin: "", targetRepMax: "" };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const refs = useRef<Record<Field, HTMLInputElement | null>>({
    plannedSets: null,
    targetRepMin: null,
    targetRepMax: null,
  });

  function reset(next: boolean) {
    onOpenChange(next);
    if (next) {
      setValues(initial);
      setErrors({});
      setFailure(null);
    }
  }

  const changed =
    mode.kind === "add" || FIELDS.some((f) => values[f] !== initial[f]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePlannedExercise(values);
    if (!parsed.ok) {
      setErrors(parsed.details);
      const first = FIELDS.find((f) => parsed.details[f]);
      if (first) refs.current[first]?.focus();
      return;
    }
    setErrors({});
    setFailure(null);
    startTransition(async () => {
      const result =
        mode.kind === "add"
          ? await addSessionExerciseAction({
              sessionId: mode.sessionId,
              exerciseId: mode.exerciseId,
              ...values,
            })
          : await updateSessionExerciseAction({
              sessionExerciseId: mode.sessionExerciseId,
              ...values,
            });
      if (!result.ok) {
        const details = result.error.details ?? {};
        if (FIELDS.some((f) => details[f])) setErrors(details);
        else setFailure(result.error.message);
        return;
      }
      onOpenChange(false);
      if (mode.kind === "add") {
        toast.success(`${exercise.name} added`, { duration: 4000 });
        mode.onAdded();
      } else {
        toast.success("Saved", { duration: 3000 });
      }
    });
  }

  function remove() {
    if (mode.kind !== "edit") return;
    startTransition(async () => {
      const result = await removeSessionExerciseAction(mode.sessionExerciseId);
      if (!result.ok) {
        setFailure(result.error.message);
        return;
      }
      onOpenChange(false);
      toast(`${exercise.name} removed from ${mode.sessionName}`, {
        duration: 4000,
      });
    });
  }

  // Enter moves Sets → min → max; Enter on max submits.
  function onKeyDown(field: Field, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || field === "targetRepMax") return;
    event.preventDefault();
    refs.current[FIELDS[FIELDS.indexOf(field) + 1]]?.focus();
  }

  const input = (field: Field, label: string) => (
    <Input
      ref={(el) => {
        refs.current[field] = el;
      }}
      id={`pe-${field}`}
      aria-label={label}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={values[field]}
      onChange={(e) => {
        setValues((v) => ({ ...v, [field]: e.target.value }));
        setErrors({});
      }}
      onKeyDown={(e) => onKeyDown(field, e)}
      aria-invalid={Boolean(errors[field])}
      className="h-11 w-20 text-center text-base tabular-nums"
    />
  );

  const errorText = FIELDS.map((f) => errors[f]).find(Boolean);

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="truncate">{exercise.name}</span>
              {exercise.isArchived && <Badge variant="outline">Archived</Badge>}
            </DialogTitle>
            <DialogDescription>
              {exercise.primaryMuscleLabel} · {exercise.equipmentLabel}
            </DialogDescription>
          </DialogHeader>

          {exercise.isArchived && (
            <p className="text-sm">
              This exercise is archived. Replace it or remove it.
            </p>
          )}

          <div className="flex items-end gap-6">
            <div className="space-y-2">
              <Label htmlFor="pe-plannedSets">Sets</Label>
              {input("plannedSets", "Sets")}
            </div>
            <div className="space-y-2">
              <span className="text-sm leading-none font-medium">Reps</span>
              <div className="flex items-center gap-2">
                {input("targetRepMin", "Minimum reps")}
                <span aria-hidden className="text-muted-foreground">
                  –
                </span>
                {input("targetRepMax", "Maximum reps")}
              </div>
            </div>
          </div>
          {errorText && (
            <p role="alert" className="text-sm text-destructive">
              {errorText}
            </p>
          )}

          {failure && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          )}

          {mode.kind === "edit" && (
            <div className="space-y-2 border-t border-border pt-4">
              <Button
                asChild
                variant={exercise.isArchived ? "default" : "outline"}
                className="h-11 w-full"
              >
                {/* Close first: Next keeps visited routes mounted, so an open
                    dialog would still be open when the lifter comes back. */}
                <Link
                  href={mode.replaceHref}
                  onClick={() => onOpenChange(false)}
                >
                  Replace exercise
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full"
                disabled={isPending}
                onClick={remove}
              >
                Remove from session
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Removing it from this session leaves it in your library.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !changed}>
              {isPending
                ? mode.kind === "add"
                  ? "Adding…"
                  : "Saving…"
                : mode.kind === "add"
                  ? "Add to session"
                  : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
