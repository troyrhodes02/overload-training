"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CARDIO_TYPE_MAX,
  CARDIO_TYPE_SUGGESTIONS,
} from "@/lib/cardio/validation";

/**
 * The two cardio fields (Cardio Logging design §10): an activity and whole
 * minutes — nothing else, on every cardio surface. Shared by the plan dialog
 * and the log/correct dialog.
 */

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** Free text with native suggestions — any activity is accepted (R6, R69). */
export function CardioActivityInput({
  id,
  value,
  onChange,
  error,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Activity</Label>
      <Input
        id={id}
        value={value}
        list={listId}
        maxLength={CARDIO_TYPE_MAX}
        placeholder="e.g. Incline Walk"
        autoComplete="off"
        autoFocus={autoFocus}
        className="h-11"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {CARDIO_TYPE_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {error && <FieldError id={errorId} message={error} />}
    </div>
  );
}

/** Whole minutes on the numeric keypad, with a "min" suffix (R7). */
export function MinutesInput({
  id,
  value,
  onChange,
  error,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Minutes</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoFocus={autoFocus}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-24 text-base tabular-nums"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">min</span>
      </div>
      {error && <FieldError id={errorId} message={error} />}
    </div>
  );
}
