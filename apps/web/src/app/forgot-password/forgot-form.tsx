"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { requestPasswordResetAction, type ForgotState } from "./actions";
import { AuthCard } from "@/components/auth/auth-card";
import { BotChallenge } from "@/components/auth/bot-challenge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkEmail } from "@/lib/accounts/validation";

const CHALLENGE_FAILED = "Couldn't verify you're human. Try again.";

/**
 * Request a reset link (Public Accounts design Screen 3). The confirmation is
 * word-for-word the same for every address; only the typed email is echoed.
 * A bot challenge sits above the primary button, exactly as on signup, and the
 * button stays disabled until it passes (D3). A failed challenge is reported in
 * a form Alert identical to signup's — and the server reports it before any
 * lookup, so it reveals nothing about any address.
 */
export function ForgotPasswordForm({
  initialEmail,
  linkExpired,
  turnstileSiteKey,
}: {
  initialEmail: string;
  linkExpired: boolean;
  turnstileSiteKey: string | null;
}) {
  const [state, formAction, isPending] = useActionState<ForgotState, FormData>(
    requestPasswordResetAction,
    { status: "idle", email: initialEmail, error: null },
  );
  // "send it again" returns to the request form without a page load.
  const [again, setAgain] = useState<ForgotState | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [challengeReady, setChallengeReady] = useState(false);
  const onChallengeReady = useCallback(
    (v: boolean) => setChallengeReady(v),
    [],
  );
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
    // The challenge must have produced a token; the button is disabled until
    // then, so this is a belt-and-braces guard. The server verifies it anyway.
    if (!challengeReady) return;
    startTransition(() => formAction(data));
  }

  const needHelp = (
    <Link
      href="/support"
      className="font-medium text-muted-foreground underline-offset-4 hover:underline"
    >
      Need help?
    </Link>
  );

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

  // A malformed-email message is field-level; the challenge message is a form
  // Alert matching signup. The server collapses everything else into "sent".
  const fieldError =
    clientError ??
    (state.status === "invalid" && state.error !== CHALLENGE_FAILED
      ? state.error
      : null);
  const challengeError =
    state.status === "invalid" && state.error === CHALLENGE_FAILED;

  return (
    <AuthCard
      footer={
        <>
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>{" "}
          · {needHelp}
        </>
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
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? "email-error" : undefined}
            onChange={() => setClientError(null)}
            autoFocus
          />
          {fieldError ? (
            <p
              id="email-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {fieldError}
            </p>
          ) : null}
        </div>
        {challengeError ? (
          <Alert variant="destructive">
            <AlertDescription>{CHALLENGE_FAILED}</AlertDescription>
          </Alert>
        ) : null}
        <BotChallenge
          siteKey={turnstileSiteKey}
          onReadyChange={onChallengeReady}
        />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={isPending || !challengeReady}
        >
          {isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
