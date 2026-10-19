"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type RefObject,
} from "react";
import { signUpAction, type SignUpState } from "./actions";
import type { SignUpField } from "@/lib/accounts/signup";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkEmail,
  checkName,
  PASSWORD_MIN_LENGTH,
  PROFILE_NAME_MAX,
} from "@/lib/accounts/validation";

const initial: SignUpState = {
  status: "idle",
  fieldErrors: {},
  formError: null,
  values: { inviteCode: "", firstName: "", lastName: "", email: "" },
};

const FIELD_ORDER: SignUpField[] = [
  "inviteCode",
  "firstName",
  "lastName",
  "email",
  "password",
];

const noSubscribe = () => () => {};
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

/**
 * Invite code first, then name, email, password (Accounts design doc Screen
 * 2). Presence is checked here for quick feedback; the invite code is checked
 * only on the server. The device's timezone rides along in a hidden field.
 */
export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, initial);
  const [clientErrors, setClientErrors] = useState<
    Partial<Record<SignUpField, string>>
  >({});
  const timeZone = useSyncExternalStore(noSubscribe, deviceTimeZone, () => "");
  const inviteCodeRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Only called from effects and handlers, never during render.
  const refFor = (field: SignUpField): RefObject<HTMLInputElement | null> =>
    ({
      inviteCode: inviteCodeRef,
      firstName: firstNameRef,
      lastName: lastNameRef,
      email: emailRef,
      password: passwordRef,
    })[field];
  const errors = { ...state.fieldErrors, ...clientErrors };

  // After a failed submit: clear the password and focus the first problem.
  useEffect(() => {
    if (state.status !== "error") return;
    if (passwordRef.current) passwordRef.current.value = "";
    const first = FIELD_ORDER.find((f) => state.fieldErrors[f]);
    refFor(first ?? "email").current?.focus();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const found: Partial<Record<SignUpField, string>> = {};
    if (!String(data.get("inviteCode") ?? "").trim()) {
      found.inviteCode = "Enter the invite code.";
    }
    const first = checkName("firstName", data.get("firstName"));
    if (!first.ok) found.firstName = first.message;
    const last = checkName("lastName", data.get("lastName"));
    if (!last.ok) found.lastName = last.message;
    const email = checkEmail(data.get("email"));
    if (!email.ok) found.email = email.message;
    if (!data.get("password")) found.password = "Enter a password.";
    setClientErrors(found);
    const firstBad = FIELD_ORDER.find((f) => found[f]);
    if (firstBad) {
      refFor(firstBad).current?.focus();
      return;
    }
    startTransition(() => formAction(data));
  }

  const clear = (field: SignUpField) =>
    setClientErrors((e) => ({ ...e, [field]: undefined }));
  const describedBy = (field: SignUpField, help?: string) =>
    [help, errors[field] ? `${field}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  const fieldError = (field: SignUpField) =>
    errors[field] ? (
      <p
        id={`${field}-error`}
        role="alert"
        className="text-sm text-destructive"
      >
        {errors[field]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <h1 className="text-lg font-semibold">Create your account</h1>
      <input type="hidden" name="timeZone" value={timeZone} />

      <div className="space-y-2">
        <Label htmlFor="inviteCode">Invite code</Label>
        <Input
          ref={inviteCodeRef}
          id="inviteCode"
          name="inviteCode"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-11 aria-invalid:border-destructive"
          defaultValue={state.values.inviteCode}
          aria-invalid={Boolean(errors.inviteCode)}
          aria-describedby={describedBy("inviteCode")}
          onChange={() => clear("inviteCode")}
          autoFocus
        />
        {fieldError("inviteCode")}
      </div>

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        {(["firstName", "lastName"] as const).map((field) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={field}>
              {field === "firstName" ? "First name" : "Last name"}
            </Label>
            <Input
              ref={field === "firstName" ? firstNameRef : lastNameRef}
              id={field}
              name={field}
              autoComplete={
                field === "firstName" ? "given-name" : "family-name"
              }
              maxLength={PROFILE_NAME_MAX}
              className="h-11 aria-invalid:border-destructive"
              defaultValue={state.values[field]}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={describedBy(field)}
              onChange={() => clear(field)}
            />
            {fieldError(field)}
          </div>
        ))}
      </div>

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
          defaultValue={state.values.email}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email")}
          onChange={() => clear("email")}
        />
        {fieldError("email")}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("password", "password-help")}
          onChange={() => clear("password")}
        />
        <p id="password-help" className="text-sm text-muted-foreground">
          At least {PASSWORD_MIN_LENGTH} characters.
        </p>
        {fieldError("password")}
      </div>

      {state.formError === "email_taken" ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span>
              An account with this email already exists.{" "}
              <Link href="/login" className="font-medium underline">
                Sign in
              </Link>{" "}
              or{" "}
              <Link
                href={`/forgot-password?email=${encodeURIComponent(state.values.email.trim())}`}
                className="font-medium underline"
              >
                reset your password
              </Link>
              .
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
      {state.formError === "unexpected" ? (
        <Alert variant="destructive">
          <AlertDescription>
            Couldn&apos;t create your account. Nothing was saved. Try again.
          </AlertDescription>
        </Alert>
      ) : null}
      {state.status === "closed" ? (
        <Alert variant="destructive">
          <AlertDescription>Signup isn&apos;t open right now.</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
