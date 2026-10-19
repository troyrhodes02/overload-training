"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  deleteAccountAction,
  type DeleteAccountState,
} from "@/app/(app)/settings/delete-account/actions";
import type { AccountInventoryDto } from "@/lib/accounts/deletion";
import { PasswordInput } from "@/components/auth/password-input";
import { StickyActions } from "@/components/plan/plan-bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const ROWS: { key: keyof AccountInventoryDto; label: string }[] = [
  { key: "mesocycles", label: "Plans (mesocycles)" },
  { key: "loggedSessions", label: "Logged workouts" },
  { key: "loggedSets", label: "Logged sets" },
  { key: "goals", label: "Goals" },
  { key: "gyms", label: "Gyms" },
  { key: "customExercises", label: "Custom exercises" },
  { key: "cardioLogs", label: "Cardio logs" },
];

const FORM_ERRORS: Record<
  NonNullable<DeleteAccountState["formError"]>,
  string
> = {
  nothing_deleted:
    "Couldn't delete your account. Nothing was deleted. Try again.",
  identity_pending:
    "Your training data was deleted, but closing your account didn't finish. Try again to finish.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
};

/**
 * The inventory and the confirmation (Accounts design doc Screen 7). The
 * permanent button stays disabled until a password is typed; nothing here
 * names an account — the server acts on the signed-in one.
 */
export function DeleteAccountForm({
  inventory,
}: {
  inventory: AccountInventoryDto;
}) {
  const [state, formAction, isPending] = useActionState<
    DeleteAccountState,
    FormData
  >(deleteAccountAction, { status: "idle", fieldError: null, formError: null });
  const [hasPassword, setHasPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const rows = ROWS.filter((r) => inventory[r.key] > 0);

  useEffect(() => {
    if (state.status !== "error") return;
    if (passwordRef.current) passwordRef.current.value = "";
    passwordRef.current?.focus();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!data.get("password")) return;
    setHasPassword(false);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        {rows.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card px-4">
            {rows.map((r) => (
              <li
                key={r.key}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span>{r.label}</span>
                <span className="font-medium tabular-nums">
                  {inventory[r.key]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            Your account has no training data yet.
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          The shared exercise library isn&apos;t affected.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="current-password"
          disabled={isPending}
          aria-invalid={Boolean(state.fieldError)}
          aria-describedby={
            state.fieldError ? "password-error" : "password-help"
          }
          onChange={(e) => setHasPassword(e.target.value.length > 0)}
        />
        {state.fieldError ? (
          <p
            id="password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {state.fieldError}
          </p>
        ) : (
          <p id="password-help" className="text-sm text-muted-foreground">
            Enter your password to confirm.
          </p>
        )}
      </div>

      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{FORM_ERRORS[state.formError]}</AlertDescription>
        </Alert>
      ) : null}

      <StickyActions>
        <div className="space-y-2">
          <Button
            type="submit"
            variant="destructive"
            className="h-11 w-full"
            disabled={!hasPassword || isPending}
          >
            {isPending ? "Deleting…" : "Delete account permanently"}
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-11 w-full"
            aria-disabled={isPending}
          >
            <Link
              href="/settings"
              tabIndex={isPending ? -1 : undefined}
              className={isPending ? "pointer-events-none opacity-50" : ""}
            >
              Cancel
            </Link>
          </Button>
        </div>
      </StickyActions>
    </form>
  );
}
