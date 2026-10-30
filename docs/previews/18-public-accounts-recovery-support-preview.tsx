/* eslint-disable */
// @ts-nocheck
/**
 * Public Accounts, Recovery & Support — UI Design Preview (implementation contract)
 * ================================================================================
 * Pitch 18 (roadmap 19) · generated from
 * docs/design/18-public-accounts-recovery-support-design-doc.md v1.0
 *
 * THIS IS A RENDERING OF THE DESIGN, NOT PRODUCT CODE. A self-contained,
 * mock-data-only preview used as the visual contract the spec and the
 * implementation tickets are held to. It never touches Prisma, Supabase, a
 * server action, Turnstile, SMTP, or the network. It is excluded from
 * typecheck, lint, format, and the build (tsconfig.json / eslint.config.mjs /
 * .prettierignore) and is never imported by the app. The real UI is built with
 * shadcn/ui against src/app/globals.css; where this preview and the theme
 * disagree, the theme wins. The bot-challenge widget here is an inline stand-in
 * for Cloudflare Turnstile — the shapes, not the real managed widget.
 *
 * The chrome above the frame (screen, state, width, appearance) is preview
 * chrome only — not product UI.
 *
 * Commitments every frame is built to respect (from the design doc):
 *   • Say the same thing to everyone. The forgot-password confirmation is
 *     word-for-word identical whether or not the email has an account; a failed
 *     challenge or a rate-limit hit on recovery is folded into that identical
 *     "Check your email" state and never reveals membership.
 *   • The door has three settings (closed / invite-only / public); the browser
 *     renders exactly one, never infers the mode. A wrong invite code gets one
 *     calm line and no other field feedback.
 *   • The bot check is furniture, not a gate: quiet when it passes, one shared
 *     message when it fails; when it cannot load at all the primary button
 *     stays DISABLED (D3), never a skip-on-failure path.
 *   • Capture is free, so nothing here is ever locked. Verification is a gentle,
 *     dismissible Settings nudge that gates no Free screen and shows no upgrade
 *     note. Export is one Free button on any plan.
 *   • The only email ever shown is the signed-in account's own, or the one the
 *     lifter just typed. No colored page/banner — destructive red marks only
 *     inline validation and the shipped delete control. Progress/deload tokens
 *     are used nowhere in this feature.
 *   • Recovery never walks a suspended account back in (status wins on the next
 *     request). The admin "Send reset email" action is owner-only, audited, and
 *     changes nothing on the account.
 */
import * as React from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  Check,
  X,
  TriangleAlert,
  Mail,
  ArrowLeft,
  ShieldCheck,
  Download,
  CircleCheck,
  CircleAlert,
  LifeBuoy,
} from "lucide-react";

/* ───────────────────────────── mock data ───────────────────────────── */

const OWN_EMAIL = "will@example.com";
const SUPPORT_ADDRESS = "support@overload.app"; // the support sender identity (placeholder; owner/runbook sets the real one)
const AUTH_SENDER = "no-reply@overload.app"; // the authentication sender identity (placeholder)
const HELPED_ACCOUNT = { name: "Maya Chen", email: "maya@example.com" };

/* ───────────────────────── shadcn-shaped primitives ─────────────────────── */

const cx = (...c) => c.filter(Boolean).join(" ");

function Button({ variant = "default", size = "default", className, children, disabled, ...p }) {
  const v = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-border bg-background hover:bg-accent",
    ghost: "hover:bg-accent",
    destructive: "bg-destructive text-white hover:bg-destructive/90",
    destructiveOutline: "border border-destructive/40 bg-background text-destructive hover:bg-destructive/5",
    link: "text-primary underline-offset-4 hover:underline px-0 h-auto",
  }[variant];
  const s = { default: "h-10 px-4", lg: "h-11 px-5", sm: "h-9 px-3", icon: "size-10" }[size];
  return (
    <button
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        v,
        s,
        className,
      )}
      {...p}
    >
      {children}
    </button>
  );
}

function Label({ children, htmlFor, className }) {
  return (
    <label htmlFor={htmlFor} className={cx("text-sm font-medium leading-none text-foreground", className)}>
      {children}
    </label>
  );
}

function Input({ className, invalid, ...p }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cx(
        "h-11 w-full rounded-md border bg-background px-3 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        invalid ? "border-destructive focus-visible:ring-destructive/30" : "border-input",
        className,
      )}
      {...p}
    />
  );
}

function PasswordInput({ id, value = "", placeholder = "••••••••••", invalid, autoComplete = "new-password" }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        defaultValue={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        className={cx(
          "h-11 w-full rounded-md border bg-background px-3 pr-11 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
          invalid ? "border-destructive focus-visible:ring-destructive/30" : "border-input",
        )}
      />
      <button
        type="button"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function FieldError({ children }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

function Helper({ children, id }) {
  return (
    <p id={id} className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}

// Form-level destructive Alert — sits inside the card above the primary button.
function FormAlert({ children }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

// Neutral notice — "Check your email", expired link, verify nudge, export info.
function Notice({ children, onDismiss, icon: I = CircleAlert }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground"
    >
      <I aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
      {onDismiss && (
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-m-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

const Sk = ({ className }) => <div className={cx("animate-pulse rounded-md bg-muted", className)} />;

/* ───────────────────────── shared frames ─────────────────────── */

// The shipped AuthCard frame: min-h-dvh centered, max-w-sm column, wordmark
// above one rounded-lg border bg-card p-6 card with space-y-4, optional footer.
function AuthCard({ children, footer }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-6 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-2xl font-semibold tracking-tight">Overload</div>
        <div className="space-y-4 rounded-lg border border-border bg-card p-6">{children}</div>
        {footer ? <div className="mt-4 space-y-1 text-center text-sm">{footer}</div> : null}
      </div>
    </div>
  );
}

function CardHeading({ children, sub }) {
  return (
    <div className="space-y-1">
      <h1 className="text-lg font-semibold text-card-foreground">{children}</h1>
      {sub ? <p className="text-sm text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function HelpFooter({ signin = true }) {
  return (
    <>
      {signin && (
        <p className="text-muted-foreground">
          Already have an account?{" "}
          <a className="text-primary underline-offset-4 hover:underline">Sign in</a>
        </p>
      )}
      <a className="text-muted-foreground underline-offset-4 hover:underline">Need help?</a>
    </>
  );
}

/* ───────────────────────── bot-challenge widget (Screen 7) ─────────────────────── */

function BotChallenge({ status = "passed" }) {
  // status: loading | passed | failed | unavailable
  const base = "flex h-[64px] w-full items-center gap-2 rounded-md border px-3 text-sm";
  if (status === "unavailable") {
    return (
      <div className={cx(base, "border-border bg-muted/30 text-muted-foreground")}>
        <TriangleAlert aria-hidden className="size-4 shrink-0" />
        <span>Couldn&apos;t load the human check. Check your connection and refresh.</span>
      </div>
    );
  }
  if (status === "loading") {
    return (
      <div className={cx(base, "border-border bg-muted/30 text-muted-foreground")}>
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
        <span>Verifying…</span>
      </div>
    );
  }
  if (status === "failed") {
    // the widget itself resets quietly; the form Alert carries the message
    return (
      <div className={cx(base, "border-border bg-muted/30 text-muted-foreground")}>
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
        <span>Verifying…</span>
      </div>
    );
  }
  return (
    <div className={cx(base, "border-border bg-card text-foreground")}>
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="size-3.5" />
      </span>
      <span className="text-muted-foreground">Verified</span>
      <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground/70">human check</span>
    </div>
  );
}

/* ───────────────────────── Screen 1: Signup (three modes) ─────────────────────── */

function NameRow({ error }) {
  return (
    <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="first">First name</Label>
        <Input id="first" autoComplete="given-name" defaultValue="Sam" maxLength={50} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="last">Last name</Label>
        <Input id="last" autoComplete="family-name" defaultValue="Ortiz" maxLength={50} />
      </div>
    </div>
  );
}

function SignupForm({ mode = "public", error, loading, challenge = "passed" }) {
  // mode: public | invite | closed ; error: wrong-invite | email-taken | username-taken | challenge | rate-limit | unexpected
  if (mode === "closed") {
    return (
      <AuthCard footer={<a className="text-muted-foreground underline-offset-4 hover:underline">Need help?</a>}>
        <CardHeading sub="New accounts can't be created right now. If you already have one, sign in.">
          Signup isn&apos;t open
        </CardHeading>
        <Button variant="outline" className="h-11 w-full">
          Sign in
        </Button>
      </AuthCard>
    );
  }

  const challengeReady = challenge === "passed";
  const primaryDisabled = loading || !challengeReady;

  return (
    <AuthCard footer={<HelpFooter />}>
      <CardHeading>Create your account</CardHeading>

      {error === "email-taken" && (
        <FormAlert>
          An account with this email already exists.{" "}
          <a className="font-medium underline underline-offset-4">Sign in</a> instead.
        </FormAlert>
      )}
      {error === "challenge" && <FormAlert>Couldn&apos;t verify you&apos;re human. Try again.</FormAlert>}
      {error === "rate-limit" && <FormAlert>Too many attempts. Wait a minute and try again.</FormAlert>}
      {error === "unexpected" && (
        <FormAlert>Couldn&apos;t create your account. Nothing was saved. Try again.</FormAlert>
      )}

      {mode === "invite" && (
        <div className="space-y-1.5">
          <Label htmlFor="invite">Invite code</Label>
          <Input
            id="invite"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            invalid={error === "wrong-invite" || error === "invite-missing"}
            autoFocus
          />
          {error === "invite-missing" && <FieldError>Enter the invite code.</FieldError>}
          {error === "wrong-invite" && <FieldError>That invite code isn&apos;t valid.</FieldError>}
        </div>
      )}

      <NameRow />

      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue="sam_o"
          invalid={error === "username-taken"}
          aria-describedby="username-help"
        />
        {error === "username-taken" ? (
          <FieldError>That username is taken.</FieldError>
        ) : (
          <Helper id="username-help">
            3–20 characters: lowercase letters, numbers, and underscores.
          </Helper>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" inputMode="email" autoComplete="email" defaultValue="sam@example.com" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" value="••••••••••" />
        <Helper>At least 6 characters.</Helper>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordInput id="confirm" value="••••••••••" />
      </div>

      <BotChallenge status={challenge} />

      <Button className="h-11 w-full" disabled={primaryDisabled}>
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Creating account…
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </AuthCard>
  );
}

/* ───────────────────────── Screen 2: Login (extended) ─────────────────────── */

function LoginForm({ notice, error }) {
  // notice: deleted | password-updated ; error: credentials | rate-limit
  return (
    <AuthCard
      footer={
        <>
          <p className="text-muted-foreground">
            New to Overload?{" "}
            <a className="text-primary underline-offset-4 hover:underline">Create an account</a>
          </p>
          <a className="text-muted-foreground underline-offset-4 hover:underline">Need help?</a>
        </>
      }
    >
      <CardHeading>Sign in</CardHeading>

      {notice === "deleted" && <Notice>Your account was deleted.</Notice>}
      {notice === "password-updated" && (
        <Notice icon={CircleCheck}>Password updated. Sign in with your new password.</Notice>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" type="email" autoComplete="email" autoFocus defaultValue="" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-pw">Password</Label>
          <a className="text-sm text-primary underline-offset-4 hover:underline">Forgot password?</a>
        </div>
        <PasswordInput id="login-pw" value="" autoComplete="current-password" placeholder="" />
      </div>

      {error === "credentials" && <FormAlert>Wrong email or password.</FormAlert>}
      {error === "rate-limit" && <FormAlert>Too many attempts. Wait a minute and try again.</FormAlert>}

      <Button className="h-11 w-full">Sign in</Button>
    </AuthCard>
  );
}

/* ───────────────────────── Screen 3: Forgot password ─────────────────────── */

function ForgotPassword({ state = "request", challenge = "passed", error }) {
  // state: request | sent | expired-arrival ; error: email-missing | email-invalid | challenge | network
  if (state === "sent") {
    return (
      <AuthCard
        footer={<a className="text-muted-foreground underline-offset-4 hover:underline">Need help?</a>}
      >
        <CardHeading>Check your email</CardHeading>
        <p className="text-sm text-muted-foreground">
          If an account exists for <strong className="text-foreground">{OWN_EMAIL}</strong>, a link to
          reset its password is on the way. The link works once and expires in 1 hour.
        </p>
        <p className="text-sm text-muted-foreground">
          Nothing after a few minutes? Check spam, or{" "}
          <a className="text-primary underline-offset-4 hover:underline">send it again</a>.
        </p>
        <Button variant="outline" className="h-11 w-full">
          <ArrowLeft className="size-4" /> Back to sign in
        </Button>
      </AuthCard>
    );
  }

  const challengeReady = challenge === "passed";
  return (
    <AuthCard
      footer={
        <p className="text-muted-foreground">
          <a className="text-primary underline-offset-4 hover:underline">Back to sign in</a>
          <span className="px-1.5 text-muted-foreground/60">·</span>
          <a className="underline-offset-4 hover:underline">Need help?</a>
        </p>
      }
    >
      <CardHeading sub="We'll email you a link to set a new one.">Reset your password</CardHeading>

      {state === "expired-arrival" && (
        <Notice>That reset link has expired or was already used. Send a new one below.</Notice>
      )}
      {error === "challenge" && <FormAlert>Couldn&apos;t verify you&apos;re human. Try again.</FormAlert>}
      {error === "network" && <FormAlert>Couldn&apos;t send. Check your connection and try again.</FormAlert>}

      <div className="space-y-1.5">
        <Label htmlFor="fp-email">Email</Label>
        <Input
          id="fp-email"
          type="email"
          autoComplete="email"
          autoFocus
          defaultValue={OWN_EMAIL}
          invalid={error === "email-missing" || error === "email-invalid"}
        />
        {error === "email-missing" && <FieldError>Enter your email.</FieldError>}
        {error === "email-invalid" && <FieldError>Enter a valid email address.</FieldError>}
      </div>

      <BotChallenge status={challenge} />

      <Button className="h-11 w-full" disabled={!challengeReady}>
        Send reset link
      </Button>
    </AuthCard>
  );
}

/* ───────────────────────── Screen 4: Reset email ─────────────────────── */

function EmailPreview({ subject, from, children }) {
  return (
    <div className="bg-muted/40 p-6">
      <div className="mx-auto max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="space-y-1 border-b border-border px-5 py-3 text-xs text-muted-foreground">
          <div>
            <span className="text-foreground">From:</span> Overload &lt;{from}&gt;
          </div>
          <div>
            <span className="text-foreground">Subject:</span>{" "}
            <span className="text-foreground">{subject}</span>
          </div>
        </div>
        <div className="space-y-4 px-5 py-6 text-sm text-foreground">{children}</div>
      </div>
      <p className="mx-auto mt-3 max-w-md text-center text-xs text-muted-foreground">
        Plain email: one link, no logo image, no tracking pixel, no marketing footer. A plain-text
        fallback carries the same sentences and the raw link.
      </p>
    </div>
  );
}

function ResetEmail() {
  return (
    <EmailPreview subject="Reset your Overload password" from={AUTH_SENDER}>
      <p>Someone asked to reset the password for your Overload account.</p>
      <a className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground">
        Set a new password
      </a>
      <p className="text-muted-foreground">
        This link works once and expires in 1 hour. If you didn&apos;t ask for this, ignore this email
        — your password won&apos;t change.
      </p>
    </EmailPreview>
  );
}

/* ───────────────────────── Screen 5: Set a new password ─────────────────────── */

function ResetPassword({ state = "form", error }) {
  // state: form | expired ; error: pw-missing | pw-short | reuse | unexpected
  if (state === "expired") {
    return (
      <AuthCard>
        <CardHeading sub="Reset links work once and expire after an hour.">
          This link has expired
        </CardHeading>
        <Button className="h-11 w-full">Send a new link</Button>
        <a className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          Back to sign in
        </a>
      </AuthCard>
    );
  }
  return (
    <AuthCard>
      <CardHeading sub={`For ${OWN_EMAIL}`}>Set a new password</CardHeading>

      {error === "unexpected" && (
        <FormAlert>
          Couldn&apos;t set your password. Try again, or{" "}
          <a className="font-medium underline underline-offset-4">send a new link</a>.
        </FormAlert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="new-pw">New password</Label>
        <PasswordInput id="new-pw" value="" placeholder="" invalid={!!error && error !== "unexpected"} />
        {error === "pw-missing" ? (
          <FieldError>Enter a new password.</FieldError>
        ) : error === "pw-short" ? (
          <FieldError>Use at least 6 characters.</FieldError>
        ) : error === "reuse" ? (
          <FieldError>Choose a password you haven&apos;t used here.</FieldError>
        ) : (
          <Helper>At least 6 characters.</Helper>
        )}
      </div>

      <Button className="h-11 w-full">Set new password</Button>
    </AuthCard>
  );
}

/* ───────────────────────── Settings shell (for nudge, export) ─────────────────────── */

function SettingsCard({ title, children }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function SettingsShell({ desktop, children }) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="font-semibold">Overload</span>
        <span className="ml-auto text-sm text-muted-foreground">Settings</span>
      </header>
      <main className={cx("mx-auto w-full px-4 py-6", desktop ? "max-w-screen-sm" : "")}>
        <div className="space-y-6">{children}</div>
      </main>
    </div>
  );
}

/* ───────────────────────── Screen 6: Email verification ─────────────────────── */

function VerifyNudge({ state = "unverified", onDismiss }) {
  // state: unverified | sent | verified
  return (
    <div className="space-y-1.5">
      <Label>Email</Label>
      <p className="text-sm text-foreground">{OWN_EMAIL}</p>

      {state === "unverified" && (
        <Notice onDismiss={onDismiss}>
          Your email isn&apos;t verified yet. Verify it so you&apos;re ready when paid plans arrive.
          <div className="mt-2">
            <Button variant="link" className="text-primary">
              Send verification email
            </Button>
          </div>
        </Notice>
      )}

      {state === "sent" && (
        <Notice icon={Mail}>
          Verification email sent to <strong>{OWN_EMAIL}</strong>. Follow the link in it to verify.
          <div className="mt-1">
            <a className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Didn&apos;t arrive? Send it again.
            </a>
          </div>
        </Notice>
      )}

      {state === "verified" && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3.5" /> Verified
        </p>
      )}
    </div>
  );
}

function SettingsProfile({ desktop, verifyState = "unverified" }) {
  const [dismissed, setDismissed] = React.useState(false);
  return (
    <SettingsShell desktop={desktop}>
      <SettingsCard title="Profile">
        <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="s-first">First name</Label>
            <Input id="s-first" defaultValue="William" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-last">Last name</Label>
            <Input id="s-last" defaultValue="Rhodes" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-username">Username</Label>
          <Input id="s-username" defaultValue="wrhodes" />
          <Helper>3–20 characters: lowercase letters, numbers, and underscores.</Helper>
        </div>
        <VerifyNudge
          state={verifyState === "unverified" && dismissed ? "verified-hidden" : verifyState}
          onDismiss={() => setDismissed(true)}
        />
        {verifyState === "unverified" && dismissed && (
          <p className="text-xs text-muted-foreground">
            (nudge dismissed for this session — returns on a later visit while unverified)
          </p>
        )}
      </SettingsCard>
      <div className="flex justify-end">
        <Button className="h-11">Save</Button>
      </div>
    </SettingsShell>
  );
}

function VerifyConfirmation({ state = "verified", signedIn = true }) {
  // state: verified | expired
  const body =
    state === "verified" ? (
      <CardHeading sub={`${OWN_EMAIL} is verified.`}>Email verified</CardHeading>
    ) : (
      <CardHeading sub="Open Settings and send a new one.">This verification link has expired</CardHeading>
    );
  return (
    <AuthCard>
      {body}
      {state === "verified" ? (
        <Button className="h-11 w-full">{signedIn ? "Go to Today" : "Sign in"}</Button>
      ) : (
        <Button variant="outline" className="h-11 w-full">
          {signedIn ? "Open Settings" : "Sign in"}
        </Button>
      )}
    </AuthCard>
  );
}

function VerifyEmail() {
  return (
    <EmailPreview subject="Verify your Overload email" from={AUTH_SENDER}>
      <p>Confirm this is your email for Overload.</p>
      <a className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground">
        Verify email
      </a>
      <p className="text-muted-foreground">If you didn&apos;t create an Overload account, ignore this email.</p>
    </EmailPreview>
  );
}

/* ───────────────────────── Screen 8: Data export ─────────────────────── */

function Toast({ children, variant = "success" }) {
  const Icon = variant === "success" ? CircleCheck : CircleAlert;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg">
        <Icon className={cx("size-4", variant === "success" ? "text-primary" : "text-destructive")} />
        {children}
      </div>
    </div>
  );
}

function DataExport({ desktop, state = "idle" }) {
  // state: idle | preparing | success | error
  return (
    <SettingsShell desktop={desktop}>
      <SettingsCard title="Timezone">
        <div className="space-y-1.5">
          <Label htmlFor="tz">Timezone</Label>
          <select
            id="tz"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            defaultValue="America/Chicago"
          >
            <option>America/Chicago</option>
          </select>
        </div>
      </SettingsCard>

      <SettingsCard title="Your data">
        <div className="space-y-1">
          <p className="font-medium">Export your data</p>
          <p className="text-sm text-muted-foreground">
            Download everything in your account as one file: your plans, workouts, logged sets, goals,
            gyms, cardio, and profile. It&apos;s private to you.
          </p>
        </div>
        {state === "error" && (
          <FormAlert>Couldn&apos;t prepare your export. Try again.</FormAlert>
        )}
        <Button className="h-11" disabled={state === "preparing"}>
          {state === "preparing" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Preparing…
            </>
          ) : (
            <>
              <Download className="size-4" /> Export your data
            </>
          )}
        </Button>
      </SettingsCard>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          Permanently deletes your account and all of its training history.
        </p>
        <Button variant="destructiveOutline" className="h-11">
          Delete account…
        </Button>
      </section>

      {state === "success" && <Toast>Your data is downloading.</Toast>}
    </SettingsShell>
  );
}

/* ───────────────────────── Screen 9: Support / contact ─────────────────────── */

function SupportCard({ signedIn = false }) {
  if (signedIn) {
    return (
      <div className="min-h-full bg-background text-foreground">
        <header className="flex h-14 items-center gap-2 border-b border-border px-4">
          <span className="font-semibold">Overload</span>
        </header>
        <div className="flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6">
            <CardHeading sub="You can send feedback or a question from inside Overload.">
              Get help
            </CardHeading>
            <Button className="h-11 w-full">
              <LifeBuoy className="size-4" /> Send feedback
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Or email <span className="text-foreground">{SUPPORT_ADDRESS}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <AuthCard>
      <CardHeading sub="Email the person who runs Overload and they'll get back to you.">
        Get help
      </CardHeading>
      <p className="text-sm text-foreground">{SUPPORT_ADDRESS}</p>
      <a
        href={`mailto:${SUPPORT_ADDRESS}`}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Mail className="size-4" /> Email support
      </a>
      <Button variant="outline" className="h-11 w-full">
        <ArrowLeft className="size-4" /> Back to sign in
      </Button>
    </AuthCard>
  );
}

/* ───────────────────────── Screen 10: Admin — send reset email ─────────────────────── */

function AdminReset({ desktop, state = "idle" }) {
  // state: idle | pending | sent | failed
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <div className={cx("mx-auto flex items-center gap-3", desktop && "max-w-2xl")}>
          <span className="font-semibold">Overload</span>
          <span className="text-sm font-medium text-muted-foreground">Admin</span>
        </div>
      </header>
      <main className={cx("mx-auto space-y-6 px-4 py-6", desktop ? "max-w-2xl" : "")}>
        <div>
          <h1 className="text-lg font-semibold">{HELPED_ACCOUNT.name}</h1>
          <p className="text-sm text-muted-foreground">{HELPED_ACCOUNT.email} · Active</p>
        </div>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Access</h2>
          <p className="text-sm text-muted-foreground">This account can sign in.</p>
          <Button variant="destructiveOutline" className="h-10">
            Suspend…
          </Button>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Account help</h2>
          <p className="text-sm text-muted-foreground">
            Send this account a password-reset email, the same one they&apos;d get from &quot;Forgot
            password&quot;.
          </p>
          {state === "failed" && (
            <FormAlert>Couldn&apos;t send the reset email. Nothing was sent. Try again.</FormAlert>
          )}
          <Button variant="outline" className="h-10" disabled={state === "pending"}>
            {state === "pending" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Mail className="size-4" /> Send reset email
              </>
            )}
          </Button>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Admin actions</h2>
          <ul className="space-y-2 text-sm">
            {state === "sent" && (
              <li className="flex items-baseline gap-2">
                <ShieldCheck className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" />
                <span>
                  <span className="text-foreground">sent a password-reset email</span>{" "}
                  <span className="text-muted-foreground">· {HELPED_ACCOUNT.name} · just now</span>
                </span>
              </li>
            )}
            <li className="flex items-baseline gap-2 text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 translate-y-0.5" />
              <span>reactivated the account · {HELPED_ACCOUNT.name} · Sep 30, 2026 · 9:02 AM</span>
            </li>
          </ul>
        </section>
      </main>

      {state === "sent" && <Toast>Reset email sent to {HELPED_ACCOUNT.email}.</Toast>}
    </div>
  );
}

/* ───────────────────────── loading frame (auth skeleton) ─────────────────────── */

function AuthLoading() {
  return (
    <AuthCard>
      <Sk className="h-6 w-40" />
      <Sk className="h-11 w-full" />
      <Sk className="h-11 w-full" />
      <Sk className="h-[64px] w-full" />
      <Sk className="h-11 w-full" />
    </AuthCard>
  );
}

/* ───────────────────────── preview chrome ─────────────────────── */

const SCREENS = {
  signup: {
    label: "1 · Signup (three modes)",
    states: [
      "public",
      "invite",
      "closed",
      "invite-missing",
      "wrong-invite",
      "email-taken",
      "username-taken",
      "challenge-failed",
      "rate-limit",
      "challenge-loading",
      "challenge-unavailable",
      "creating",
    ],
    render: (p) => {
      const map = {
        public: { mode: "public" },
        invite: { mode: "invite" },
        closed: { mode: "closed" },
        "invite-missing": { mode: "invite", error: "invite-missing" },
        "wrong-invite": { mode: "invite", error: "wrong-invite" },
        "email-taken": { mode: "public", error: "email-taken" },
        "username-taken": { mode: "public", error: "username-taken" },
        "challenge-failed": { mode: "public", error: "challenge", challenge: "failed" },
        "rate-limit": { mode: "public", error: "rate-limit" },
        "challenge-loading": { mode: "public", challenge: "loading" },
        "challenge-unavailable": { mode: "public", challenge: "unavailable" },
        creating: { mode: "public", loading: true },
      };
      return <SignupForm {...map[p.state]} />;
    },
  },
  login: {
    label: "2 · Login (extended)",
    states: ["default", "password-updated", "deleted", "credentials-error", "rate-limit"],
    render: (p) => {
      const map = {
        default: {},
        "password-updated": { notice: "password-updated" },
        deleted: { notice: "deleted" },
        "credentials-error": { error: "credentials" },
        "rate-limit": { error: "rate-limit" },
      };
      return <LoginForm {...map[p.state]} />;
    },
  },
  forgot: {
    label: "3 · Forgot password",
    states: ["request", "sent", "expired-arrival", "email-missing", "email-invalid", "challenge-failed", "network", "challenge-loading"],
    render: (p) => {
      const map = {
        request: {},
        sent: { state: "sent" },
        "expired-arrival": { state: "expired-arrival" },
        "email-missing": { error: "email-missing" },
        "email-invalid": { error: "email-invalid" },
        "challenge-failed": { error: "challenge", challenge: "failed" },
        network: { error: "network" },
        "challenge-loading": { challenge: "loading" },
      };
      return <ForgotPassword {...map[p.state]} />;
    },
  },
  "reset-email": { label: "4 · Reset email", states: ["default"], render: () => <ResetEmail /> },
  reset: {
    label: "5 · Set a new password",
    states: ["form", "pw-missing", "pw-short", "reuse", "unexpected", "expired"],
    render: (p) =>
      p.state === "expired" ? (
        <ResetPassword state="expired" />
      ) : (
        <ResetPassword state="form" error={p.state === "form" ? undefined : p.state} />
      ),
  },
  "verify-nudge": {
    label: "6a · Verify nudge (Settings)",
    states: ["unverified", "sent", "verified"],
    render: (p) => <SettingsProfile desktop={p.desktop} verifyState={p.state} />,
  },
  "verify-confirm": {
    label: "6b · Verify confirmation (/verify-email)",
    states: ["verified-in", "verified-out", "expired-in", "expired-out"],
    render: (p) => {
      const map = {
        "verified-in": { state: "verified", signedIn: true },
        "verified-out": { state: "verified", signedIn: false },
        "expired-in": { state: "expired", signedIn: true },
        "expired-out": { state: "expired", signedIn: false },
      };
      return <VerifyConfirmation {...map[p.state]} />;
    },
  },
  "verify-email": { label: "6c · Verification email", states: ["default"], render: () => <VerifyEmail /> },
  export: {
    label: "8 · Data export (Settings)",
    states: ["idle", "preparing", "success", "error"],
    render: (p) => <DataExport desktop={p.desktop} state={p.state} />,
  },
  support: {
    label: "9 · Support / contact",
    states: ["signed-out", "signed-in"],
    render: (p) => <SupportCard signedIn={p.state === "signed-in"} />,
  },
  "admin-reset": {
    label: "10 · Admin — send reset email",
    states: ["idle", "pending", "sent", "failed"],
    render: (p) => <AdminReset desktop={p.desktop} state={p.state} />,
  },
  loading: { label: "· Loading (auth skeleton)", states: ["default"], render: () => <AuthLoading /> },
};

export default function PublicAccountsRecoverySupportPreview() {
  const [screen, setScreen] = React.useState("signup");
  const [state, setState] = React.useState("public");
  const [desktop, setDesktop] = React.useState(false);
  const [dark, setDark] = React.useState(false);
  const def = SCREENS[screen];
  const current = def.states.includes(state) ? state : def.states[0];
  return (
    <div className="min-h-screen bg-neutral-200 p-4 font-sans text-neutral-900">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <strong>Overload · Public Accounts, Recovery &amp; Support — preview</strong>
        <select
          value={screen}
          onChange={(e) => {
            setScreen(e.target.value);
            setState(SCREENS[e.target.value].states[0]);
          }}
          className="rounded border px-2 py-1"
        >
          {Object.entries(SCREENS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select value={current} onChange={(e) => setState(e.target.value)} className="rounded border px-2 py-1">
          {def.states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button onClick={() => setDesktop((d) => !d)} className="rounded border px-2 py-1">
          {desktop ? "Desktop 1280" : "Phone 375"}
        </button>
        <button onClick={() => setDark((d) => !d)} className="rounded border px-2 py-1">
          {dark ? "Dark" : "Light"}
        </button>
        <span className="text-neutral-500">Rendering of the design, not product code.</span>
      </div>
      <div className={cx(dark && "dark")}>
        <div
          className={cx(
            "relative mx-auto overflow-hidden rounded-xl border border-neutral-300 bg-background text-foreground",
            desktop ? "h-[860px] w-[1280px]" : "h-[812px] w-[375px]",
          )}
        >
          <div className="h-full overflow-y-auto">{def.render({ desktop, state: current })}</div>
        </div>
      </div>
    </div>
  );
}
