"use client";

import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createCustomExerciseAction,
  type CustomExerciseFormState,
} from "@/app/(app)/exercises/actions";
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
import { Toggle } from "@/components/ui/toggle";
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  isMuscleGroup,
  type MuscleGroupValue,
} from "@/lib/exercises/taxonomy";
import {
  EXERCISE_NAME_MAX,
  parseCustomExerciseInput,
} from "@/lib/exercises/validation";

type Field = "name" | "primaryMuscle" | "equipmentType" | "secondaryMuscles";
const FIELD_ORDER: Field[] = [
  "name",
  "primaryMuscle",
  "equipmentType",
  "secondaryMuscles",
];

/**
 * Add a custom exercise: name, primary muscle, and equipment are required;
 * "also trains" is optional and never offers the chosen primary. There is no
 * image field — custom exercises have no image (spec D7).
 */
export function CustomExerciseForm({ defaultName }: { defaultName: string }) {
  const initial: CustomExerciseFormState = {
    result: null,
    values: {
      name: defaultName,
      primaryMuscle: "",
      equipmentType: "",
      secondaryMuscles: [],
    },
  };
  const [state, formAction, isPending] = useActionState(
    createCustomExerciseAction,
    initial,
  );

  const [name, setName] = useState(state.values.name);
  const [primary, setPrimary] = useState(state.values.primaryMuscle);
  const [equipment, setEquipment] = useState(state.values.equipmentType);
  const [secondaries, setSecondaries] = useState<MuscleGroupValue[]>(
    state.values.secondaryMuscles.filter(isMuscleGroup),
  );
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const refs = useRef<Partial<Record<Field, HTMLElement | null>>>({});

  const serverErrors =
    state.result && !state.result.ok ? (state.result.error.details ?? {}) : {};
  const errors: Record<string, string> = { ...serverErrors, ...clientErrors };
  const failedUnexpectedly =
    state.result && !state.result.ok && !state.result.error.details;

  function choosePrimary(value: string) {
    setPrimary(value);
    // The primary can never also be a secondary.
    setSecondaries((current) => current.filter((m) => m !== value));
    setClientErrors((e) => withoutKey(e, "primaryMuscle"));
  }

  function toggleSecondary(muscle: MuscleGroupValue, on: boolean) {
    setSecondaries((current) =>
      on
        ? current.includes(muscle)
          ? current
          : [...current, muscle]
        : current.filter((m) => m !== muscle),
    );
  }

  // Submitted manually (not via `<form action>`): React 19 auto-resets a form
  // after an action submission, and Radix Select answers that reset by clearing
  // its value — which would wipe Primary muscle and Equipment after a failed
  // save even though the message says the entries are still here.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseCustomExerciseInput({
      name,
      primaryMuscle: primary,
      equipmentType: equipment,
      secondaryMuscles: secondaries,
    });
    if (!parsed.ok) {
      setClientErrors(parsed.details);
      const first = FIELD_ORDER.find((f) => parsed.details[f]);
      if (first) refs.current[first]?.focus();
      return;
    }
    setClientErrors({});
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const describedBy = (field: Field) =>
    errors[field] ? `${field}-error` : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="off"
          maxLength={EXERCISE_NAME_MAX}
          className="h-11"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setClientErrors((e) => withoutKey(e, "name"));
          }}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy("name")}
          ref={(el) => {
            refs.current.name = el;
          }}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div className="space-y-2">
        <Label id="primaryMuscle-label">Primary muscle</Label>
        <Select
          name="primaryMuscle"
          value={primary}
          onValueChange={choosePrimary}
        >
          <SelectTrigger
            className="h-11 w-full"
            aria-labelledby="primaryMuscle-label"
            aria-invalid={Boolean(errors.primaryMuscle)}
            aria-describedby={describedBy("primaryMuscle")}
            ref={(el) => {
              refs.current.primaryMuscle = el;
            }}
          >
            <SelectValue placeholder="Choose a muscle" />
          </SelectTrigger>
          <SelectContent>
            {MUSCLE_GROUPS.map((m) => (
              <SelectItem key={m} value={m}>
                {MUSCLE_GROUP_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="primaryMuscle-error" message={errors.primaryMuscle} />
      </div>

      <div className="space-y-2">
        <Label id="equipmentType-label">Equipment</Label>
        <Select
          name="equipmentType"
          value={equipment}
          onValueChange={(value) => {
            setEquipment(value);
            setClientErrors((e) => withoutKey(e, "equipmentType"));
          }}
        >
          <SelectTrigger
            className="h-11 w-full"
            aria-labelledby="equipmentType-label"
            aria-invalid={Boolean(errors.equipmentType)}
            aria-describedby={describedBy("equipmentType")}
            ref={(el) => {
              refs.current.equipmentType = el;
            }}
          >
            <SelectValue placeholder="Choose equipment" />
          </SelectTrigger>
          <SelectContent>
            {EQUIPMENT_TYPES.map((e) => (
              <SelectItem key={e} value={e}>
                {EQUIPMENT_LABELS[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="equipmentType-error" message={errors.equipmentType} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Also trains <span className="text-muted-foreground">(optional)</span>
        </legend>
        <div
          className="flex flex-wrap gap-2"
          aria-describedby={describedBy("secondaryMuscles")}
        >
          {MUSCLE_GROUPS.filter((m) => m !== primary).map((m) => (
            <Toggle
              key={m}
              variant="outline"
              size="sm"
              className="h-9 px-3"
              pressed={secondaries.includes(m)}
              onPressedChange={(on) => toggleSecondary(m, on)}
            >
              {MUSCLE_GROUP_LABELS[m]}
            </Toggle>
          ))}
        </div>
        {secondaries.map((m) => (
          <input key={m} type="hidden" name="secondaryMuscles" value={m} />
        ))}
        <FieldError
          id="secondaryMuscles-error"
          message={errors.secondaryMuscles}
        />
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Custom exercises don&apos;t have an image.
      </p>

      {failedUnexpectedly && state.result && !state.result.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.result.error.message}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Adding…" : "Add exercise"}
      </Button>
    </form>
  );
}

function withoutKey(
  errors: Record<string, string>,
  key: string,
): Record<string, string> {
  if (!(key in errors)) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
