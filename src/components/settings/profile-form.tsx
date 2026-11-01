"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import {
  updateProfileAction,
  type ProfileFormState,
} from "@/app/(app)/settings/actions";
import { StickyActions } from "@/components/plan/plan-bits";
import { VerifyEmailNudge } from "@/components/settings/verify-email-nudge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useDeviceTimeZone } from "@/lib/accounts/use-device-time-zone";
import {
  normalizeUsername,
  parseProfileInput,
  PROFILE_NAME_MAX,
  USERNAME_HELP,
  USERNAME_MAX,
  type ProfileInput,
} from "@/lib/accounts/validation";

type Props = ProfileInput & {
  email: string;
  emailVerified: boolean;
  timeZones: string[];
};
type Field = keyof ProfileInput;
type Errors = Partial<Record<Field, string>>;

/**
 * Name, username, and timezone for the signed-in account (Accounts design doc
 * Screen 6; OVE-50). An account made before usernames starts with the field
 * empty and may keep it empty; once it has a username it can change it but
 * not clear it.
 * Save stays disabled until something differs from what is saved. The
 * device-zone hint is read only on the client (null on the server render, so
 * hydration matches) and only suggests: the saved zone changes only on Save.
 */
export function ProfileForm({
  firstName,
  lastName,
  username,
  email,
  emailVerified,
  timeZone,
  timeZones,
}: Props) {
  const initial: ProfileInput = { firstName, lastName, username, timeZone };
  const [state, formAction, isPending] = useActionState<
    ProfileFormState,
    FormData
  >(updateProfileAction, { result: null, values: initial, saved: initial });
  const [values, setValues] = useState<ProfileInput>(initial);
  const [clientErrors, setClientErrors] = useState<Errors>({});
  // Fields edited since the last submit hide that submit's server error.
  const [edited, setEdited] = useState<ReadonlySet<Field>>(new Set());
  const device = useDeviceTimeZone();
  const toasted = useRef<ProfileFormState | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLSelectElement>(null);

  // Toasts are an external system: the effect only notifies, never sets state.
  useEffect(() => {
    if (!state.result || toasted.current === state) return;
    toasted.current = state;
    if (state.result.ok) toast.success("Settings saved", { duration: 4000 });
    else if (!state.result.error.details) {
      toast.error("Couldn't save. Your changes are still here.", {
        duration: Infinity,
      });
    }
  }, [state]);

  const serverErrors: Errors =
    state.result && !state.result.ok ? (state.result.error.details ?? {}) : {};
  const errorFor = (field: Field) =>
    clientErrors[field] ??
    (edited.has(field) ? undefined : serverErrors[field]);
  const failedUnexpectedly = Boolean(
    state.result && !state.result.ok && !state.result.error.details,
  );
  const saved = state.saved;
  // Saved values are stored normalized, so compare normalized input.
  const dirty =
    values.firstName.trim() !== saved.firstName ||
    values.lastName.trim() !== saved.lastName ||
    normalizeUsername(values.username) !== saved.username ||
    values.timeZone !== saved.timeZone;

  function set(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setClientErrors((e) => ({ ...e, [field]: undefined }));
    setEdited((s) => new Set(s).add(field));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The server decides from the stored profile; this mirrors it for quick
    // feedback: an account with no username yet may leave it empty.
    const parsed = parseProfileInput(values, {
      usernameRequired: saved.username !== "",
    });
    if (!parsed.ok) {
      setClientErrors(parsed.details);
      // Focus the first failing field in form order.
      const order: [Field, React.RefObject<HTMLElement | null>][] = [
        ["firstName", firstRef],
        ["lastName", lastRef],
        ["username", usernameRef],
        ["timeZone", zoneRef],
      ];
      order.find(([field]) => parsed.details[field])?.[1].current?.focus();
      return;
    }
    setClientErrors({});
    setEdited(new Set());
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  const options = timeZones.includes(values.timeZone)
    ? timeZones
    : [values.timeZone, ...timeZones];
  const zoneError = errorFor("timeZone");

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Profile</h2>
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <TextField
              id="firstName"
              label="First name"
              autoComplete="given-name"
              inputRef={firstRef}
              value={values.firstName}
              error={errorFor("firstName")}
              onChange={(v) => set("firstName", v)}
            />
            <TextField
              id="lastName"
              label="Last name"
              autoComplete="family-name"
              inputRef={lastRef}
              value={values.lastName}
              error={errorFor("lastName")}
              onChange={(v) => set("lastName", v)}
            />
          </div>
          <TextField
            id="username"
            label="Username"
            autoComplete="username"
            inputRef={usernameRef}
            value={values.username}
            error={errorFor("username")}
            help={USERNAME_HELP}
            // Room for a leading "@", which normalizeUsername drops.
            maxLength={USERNAME_MAX + 1}
            // Shown as it will be stored: usernames are lowercase.
            onChange={(v) => set("username", v.toLowerCase())}
            plain
          />
          <div className="space-y-2">
            <p className="text-sm leading-none font-medium">Email</p>
            <p className="text-sm text-muted-foreground">{email}</p>
            {/* Non-blocking verification nudge (Public Accounts Screen 6). */}
            <VerifyEmailNudge email={email} verified={emailVerified} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Timezone</h2>
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="space-y-2">
            <Label htmlFor="timeZone" className="sr-only">
              Timezone
            </Label>
            <NativeSelect
              ref={zoneRef}
              id="timeZone"
              name="timeZone"
              className="h-11 aria-invalid:border-destructive"
              value={values.timeZone}
              onChange={(e) => set("timeZone", e.target.value)}
              aria-describedby={
                zoneError ? "timeZone-help timeZone-error" : "timeZone-help"
              }
              aria-invalid={Boolean(zoneError)}
            >
              {options.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </NativeSelect>
            <p id="timeZone-help" className="text-sm text-muted-foreground">
              Today follows this timezone.
            </p>
            {zoneError && (
              <p
                id="timeZone-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {zoneError}
              </p>
            )}
          </div>
          {device &&
          device !== values.timeZone &&
          timeZones.includes(device) ? (
            <Alert role="status">
              <AlertDescription>
                <span>
                  Your device is set to{" "}
                  <span className="font-medium">{device}</span>.{" "}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => set("timeZone", device)}
                  >
                    Use it
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>

      {failedUnexpectedly ? (
        <Alert variant="destructive">
          <AlertDescription>
            Couldn&apos;t save. Your changes are still here.
          </AlertDescription>
        </Alert>
      ) : null}

      <StickyActions>
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={!dirty || isPending}
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </StickyActions>
    </form>
  );
}

/**
 * One labelled text input with optional help text and its inline error, wired
 * for screen readers (aria-invalid, aria-describedby). `plain` turns off
 * autocapitalize and spellcheck, for identifiers such as the username.
 */
function TextField({
  id,
  label,
  autoComplete,
  inputRef,
  value,
  error,
  help,
  maxLength = PROFILE_NAME_MAX,
  plain = false,
  onChange,
}: {
  id: Field;
  label: string;
  autoComplete: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  error?: string;
  help?: string;
  maxLength?: number;
  plain?: boolean;
  onChange: (value: string) => void;
}) {
  const describedBy =
    [help ? `${id}-help` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={inputRef}
        id={id}
        name={id}
        autoComplete={autoComplete}
        {...(plain ? { autoCapitalize: "none", spellCheck: false } : {})}
        maxLength={maxLength}
        className="h-11 aria-invalid:border-destructive"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      {help && (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
