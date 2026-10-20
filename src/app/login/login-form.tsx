"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  type FormEvent,
} from "react";
import { signInAction, type SignInState } from "./actions";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: SignInState = { error: null, email: "" };

/**
 * Email + password and one primary action. Submitted
 * manually (not via `<form action>`) so React 19 keeps the typed email after a
 * failed attempt; the password is cleared on purpose.
 */
export function LoginForm({ notice }: { notice: string | null }) {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    initialState,
  );
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.error) return;
    if (passwordRef.current) passwordRef.current.value = "";
    (state.email ? passwordRef : emailRef).current?.focus();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <h1 className="text-lg font-semibold">Sign in</h1>
      {notice ? (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
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
          className="h-11"
          defaultValue={state.email}
          required
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
