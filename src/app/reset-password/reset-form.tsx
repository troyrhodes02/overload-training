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
import { setNewPasswordAction, type ResetState } from "./actions";
import { ResetLinkExpired } from "./link-expired";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PASSWORD_ERRORS } from "@/lib/accounts/recovery";
import { PASSWORD_MIN_LENGTH } from "@/lib/accounts/validation";

/** Set a new password (Accounts design doc Screen 5). */
export function ResetPasswordForm({ email }: { email: string }) {
  const [state, formAction, isPending] = useActionState<ResetState, FormData>(
    setNewPasswordAction,
    { status: "idle", fieldError: null, formError: null },
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status !== "error") return;
    if (passwordRef.current) passwordRef.current.value = "";
    passwordRef.current?.focus();
  }, [state]);

  if (state.status === "expired") return <ResetLinkExpired />;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!data.get("password")) {
      setClientError(PASSWORD_ERRORS.missing);
      passwordRef.current?.focus();
      return;
    }
    setClientError(null);
    startTransition(() => formAction(data));
  }

  const error = clientError ?? state.fieldError;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <p className="text-sm text-muted-foreground">For {email}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm leading-none font-medium">
          New password
        </label>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="new-password"
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? "password-help password-error" : "password-help"
          }
          onChange={() => setClientError(null)}
          autoFocus
        />
        <p id="password-help" className="text-sm text-muted-foreground">
          At least {PASSWORD_MIN_LENGTH} characters.
        </p>
        {error ? (
          <p
            id="password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span>
              Couldn&apos;t set your password. Try again, or{" "}
              <Link href="/forgot-password" className="font-medium underline">
                send a new link
              </Link>
              .
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
