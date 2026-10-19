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
import { requestPasswordResetAction, type ForgotState } from "./actions";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkEmail } from "@/lib/accounts/validation";

/**
 * Request a reset link (Accounts design doc Screen 3). The confirmation is
 * word-for-word the same for every address; only the typed email is echoed.
 */
export function ForgotPasswordForm({
  initialEmail,
  linkExpired,
}: {
  initialEmail: string;
  linkExpired: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ForgotState, FormData>(
    requestPasswordResetAction,
    { status: "idle", email: initialEmail, error: null },
  );
  // "send it again" returns to the request form without a page load.
  const [again, setAgain] = useState<ForgotState | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const showSent = state.status === "sent" && again !== state;

  useEffect(() => {
    if (showSent) sentHeading.current?.focus();
  }, [showSent]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = checkEmail(data.get("email"));
    if (!parsed.ok) {
      setClientError(parsed.message);
      emailRef.current?.focus();
      return;
    }
    setClientError(null);
    startTransition(() => formAction(data));
  }

  if (showSent) {
    return (
      <AuthCard>
        <div className="space-y-4">
          <h1
            ref={sentHeading}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            Check your email
          </h1>
          <p className="text-sm">
            If an account exists for{" "}
            <span className="font-medium">{state.email}</span>, a link to reset
            its password is on the way. The link works once and expires in 1
            hour.
          </p>
          <p className="text-sm text-muted-foreground">
            Nothing after a few minutes? Check spam, or{" "}
            <button
              type="button"
              onClick={() => setAgain(state)}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              send it again
            </button>
            .
          </p>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const error =
    clientError ?? (state.status === "invalid" ? state.error : null);
  return (
    <AuthCard
      footer={
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ll email you a link to set a new one.
          </p>
        </div>
        {linkExpired && state.status === "idle" ? (
          <Alert role="status">
            <AlertDescription>
              That reset link has expired or was already used. Send a new one
              below.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="h-11 aria-invalid:border-destructive"
            defaultValue={state.email}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "email-error" : undefined}
            onChange={() => setClientError(null)}
            autoFocus
          />
          {error ? (
            <p
              id="email-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" className="h-11 w-full" disabled={isPending}>
          {isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
