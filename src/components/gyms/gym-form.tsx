"use client";

import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createGymAction, type GymFormState } from "@/app/(app)/gyms/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GYM_ADDRESS_MAX,
  GYM_NAME_MAX,
  parseGymInput,
} from "@/lib/gyms/validation";

const initial: GymFormState = {
  result: null,
  values: { name: "", address: "" },
};

/**
 * Add a gym: a required name and an optional line of plain text for the
 * lifter's own reference. No map, no autocomplete, no "use my location".
 */
export function GymForm() {
  const [state, formAction, isPending] = useActionState(
    createGymAction,
    initial,
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const details =
    state.result && !state.result.ok ? (state.result.error.details ?? {}) : {};
  const nameMessage = nameError ?? details.name;
  const addressMessage = details.address;
  const failedUnexpectedly =
    state.result && !state.result.ok && !state.result.error.details;

  // Submitted manually (not via `<form action>`) so React 19 does not reset
  // the form after a failed save: the entries stay exactly as typed.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = parseGymInput({
      name: data.get("name"),
      address: data.get("address"),
    });
    if (!parsed.ok && parsed.details.name) {
      setNameError(parsed.details.name);
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="gym-name">Name</Label>
        <Input
          ref={nameRef}
          id="gym-name"
          name="name"
          autoComplete="off"
          maxLength={GYM_NAME_MAX}
          defaultValue={state.values.name}
          className="h-11"
          aria-invalid={Boolean(nameMessage)}
          aria-describedby={nameMessage ? "gym-name-error" : undefined}
          onChange={() => setNameError(null)}
        />
        {nameMessage && (
          <p
            id="gym-name-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {nameMessage}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="gym-address">
          Location <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="gym-address"
          name="address"
          autoComplete="off"
          maxLength={GYM_ADDRESS_MAX}
          defaultValue={state.values.address}
          className="h-11"
          aria-describedby="gym-address-help"
          aria-invalid={Boolean(addressMessage)}
        />
        <p id="gym-address-help" className="text-sm text-muted-foreground">
          Plain text for your own reference.
        </p>
        {addressMessage && (
          <p role="alert" className="text-sm text-destructive">
            {addressMessage}
          </p>
        )}
      </div>

      {failedUnexpectedly && state.result && !state.result.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.result.error.message}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Adding…" : "Add gym"}
      </Button>
    </form>
  );
}
