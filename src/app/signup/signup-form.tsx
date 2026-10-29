"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { signUpAction, type SignUpState } from "./actions";
import type { SignupViewDto } from "./page";
import type { SignUpField } from "@/lib/accounts/signup";
import { PasswordInput } from "@/components/auth/password-input";
import { useDeviceTimeZone } from "@/lib/accounts/use-device-time-zone";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkEmail,
  checkName,
  checkUsername,
  PASSWORD_MIN_LENGTH,
  PASSWORDS_DIFFER,
  PROFILE_NAME_MAX,
  USERNAME_HELP,
  USERNAME_MAX,
} from "@/lib/accounts/validation";

const initial: SignUpState = {
  status: "idle",
  fieldErrors: {},
  formError: null,
  inviteInvalid: false,
  values: { firstName: "", lastName: "", username: "", email: "" },
};

const INVITE_MISSING = "Enter the invite code.";
const INVITE_INVALID = "That invite code isn't valid.";

const FIELD_ORDER: SignUpField[] = [
  "firstName",
  "lastName",
  "username",
  "email",
  "password",
  "confirmPassword",
];

/**
 * Name, username, email, and the password typed twice (OVE-50), plus an
 * invite-code field FIRST in invite mode (Public Accounts). The field rules are
 * checked here for quick feedback and again on the server, which alone knows
 * whether the username is free and whether the invite code is valid. The
 * invite code is never validated in the browser beyond presence, and its wrong
 * value is shown alone so a codeless visitor learns nothing. The device's
 * timezone rides along in a hidden field.
 */
export function SignupForm({ view }: { view: SignupViewDto }) {
  const inviteMode = view.mode === "invite";
  const [state, formAction, isPending] = useActionState(signUpAction, initial);
  const [clientErrors, setClientErrors] = useState<
    Partial<Record<SignUpField, string>>
  >({});
  // Invite-code feedback lives outside SignUpField: a client-side presence
  // error, or the server's wrong-code error (shown alone).
  const [inviteClientError, setInviteClientError] = useState<string | null>(
    null,
  );
  const inviteRef = useRef<HTMLInputElement>(null);
  const timeZone = useDeviceTimeZone() ?? "";
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  // Only called from effects and handlers, never during render.
  const refFor = (field: SignUpField): RefObject<HTMLInputElement | null> =>
    ({
      firstName: firstNameRef,
      lastName: lastNameRef,
      username: usernameRef,
      email: emailRef,
      password: passwordRef,
      confirmPassword: confirmPasswordRef,
    })[field];
  const errors = { ...state.fieldErrors, ...clientErrors };
  // The invite error is the server's wrong-code result (shown alone) or the
  // client-side presence check.
  const inviteError = state.inviteInvalid ? INVITE_INVALID : inviteClientError;

  // After a failed submit: clear both passwords and focus the first problem.
  // A wrong invite code is shown alone, so it takes focus ahead of any field.
  useEffect(() => {
    if (state.status !== "error") return;
    for (const ref of [passwordRef, confirmPasswordRef]) {
      if (ref.current) ref.current.value = "";
    }
    if (state.inviteInvalid) {
      inviteRef.current?.focus();
      return;
    }
    const first = FIELD_ORDER.find((f) => state.fieldErrors[f]);
    refFor(first ?? "email").current?.focus();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Invite presence is checked first, mirroring the server order. Its wrong
    // value is only ever decided on the server, never in the browser.
    if (inviteMode) {
      const invite = String(data.get("inviteCode") ?? "").trim();
      if (!invite) {
        setInviteClientError(INVITE_MISSING);
        setClientErrors({});
        inviteRef.current?.focus();
        return;
      }
      setInviteClientError(null);
    }
    const found: Partial<Record<SignUpField, string>> = {};
    const first = checkName("firstName", data.get("firstName"));
    if (!first.ok) found.firstName = first.message;
    const last = checkName("lastName", data.get("lastName"));
    if (!last.ok) found.lastName = last.message;
    const username = checkUsername(data.get("username"));
    if (!username.ok) found.username = username.message;
    const email = checkEmail(data.get("email"));
    if (!email.ok) found.email = email.message;
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirmPassword") ?? "");
    if (!password) found.password = "Enter a password.";
    else if (!confirm) found.confirmPassword = "Enter your password again.";
    else if (confirm !== password) found.confirmPassword = PASSWORDS_DIFFER;
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

      {inviteMode ? (
        <div className="space-y-2">
          <Label htmlFor="inviteCode">Invite code</Label>
          <Input
            ref={inviteRef}
            id="inviteCode"
            name="inviteCode"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-11 aria-invalid:border-destructive"
            aria-invalid={Boolean(inviteError)}
            aria-describedby={inviteError ? "inviteCode-error" : undefined}
            onChange={() => setInviteClientError(null)}
            autoFocus
          />
          {inviteError ? (
            <p
              id="inviteCode-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {inviteError}
            </p>
          ) : null}
        </div>
      ) : null}

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
              autoFocus={!inviteMode && field === "firstName"}
            />
            {fieldError(field)}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          ref={usernameRef}
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          // Room for a leading "@", which checkUsername drops.
          maxLength={USERNAME_MAX + 1}
          className="h-11 aria-invalid:border-destructive"
          defaultValue={state.values.username}
          aria-invalid={Boolean(errors.username)}
          aria-describedby={describedBy("username", "username-help")}
          onChange={() => clear("username")}
        />
        <p id="username-help" className="text-sm text-muted-foreground">
          {USERNAME_HELP}
        </p>
        {fieldError("username")}
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

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordInput
          ref={confirmPasswordRef}
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby={describedBy("confirmPassword")}
          onChange={() => clear("confirmPassword")}
        />
        {fieldError("confirmPassword")}
      </div>

      {state.formError === "email_taken" ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span>
              An account with this email already exists.{" "}
              <Link href="/login" className="font-medium underline">
                Sign in
              </Link>{" "}
              instead.
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
