---
version: 1.0.0
status: approved (autonomous run — decisions recorded below)
author: Claude Code (autonomous pipeline run)
last_updated: 2026-10-19
pitch_reference: pitches/09-accounts-signup-login-password-reset.md
design_reference: docs/design/09-accounts-signup-login-password-reset-design-doc.md (v1.0)
ui_preview_reference: docs/previews/09-accounts-signup-login-password-reset-preview.html (binding visual contract)
prd_reference: Downloads/prd (1).md → "Accounts: Signup, Login & Password Reset" (approved multi-user set; see R1)
architecture_reference: Downloads/architecture (1).md (approved multi-user set; see R1)
linear_issue: milestone "Accounts: Signup, Login & Password Reset" (tickets listed in the run progress file)
---

# Accounts: Signup, Login & Password Reset

## 2. Summary

Accounts turns Overload's single hand-made login into a small, invite-only account lifecycle: an invited person creates an email-and-password account through a server-checked invite code, any lifter signs in and out, a forgotten password is recovered through an emailed one-time link, a lifter edits their name and timezone in Settings, and a lifter can permanently delete their own account and everything it owns.

The core abstraction is **the auth identity and the profile are one account, created and destroyed together, and identity only ever comes from the auth session.** Supabase Auth holds email and password; `Profile` (from Multi-User Foundation) holds first name, last name, and the IANA timezone and is the ownership root of every owned row. Two server-only capabilities are new: a narrow **auth-admin facade** (create a confirmed user; delete a user) used only by signup and account deletion, and the **account-deletion module**, the single sanctioned path that destroys logged history — through the account-scoped client, in dependency order, in one transaction. Public Supabase signup stays **disabled** at the project level forever; the only way an account can be created is the invite-gated server action, and that action is itself closed unless the operator has configured an invite code.

"Working" means: with no invite code configured, `/signup` is closed; with one configured, a valid code creates a confirmed account, its profile (names + the browser's zone), and a session, and the person lands on an empty Today that shows nothing of any other account. A wrong code is rejected before any account lookup. Login works for the original account unchanged. A reset request returns the identical response for every address, the emailed link (custom SMTP in production, Mailpit locally) verifies on Overload's own route and allows exactly one recovery password change, and other sessions are signed out. Deleting an account removes every row it owns and its auth identity, leaves every other account and the shared library untouched, and fails safe.

## 3. Problem

- The app cannot yet let anyone but the hand-created owner in: there is no registration path, and opening Supabase's public signup would let anyone with the shipped anon key create an account without an invite.
- The app cannot yet recover a forgotten password: Supabase's built-in sender only reaches the project team (2/hour), and its default recovery link lands on the client with tokens in the URL fragment, which a server-first app can't read.
- The app cannot yet store or edit a lifter's name, or let a lifter change the timezone that decides which day Today shows (Multi-User Foundation stored it; nothing edits it).
- The app cannot yet remove an account: every owned relation is `onDelete: Restrict` by design, history must never be destroyed by ordinary code, and there is no sanctioned, ordered, atomic deletion path.
- This blocks Personalization & Navigation Polish (needs the first name), the Onboarding Tour and What's New (need real accounts), and plan seeding (needs a friend's account to exist). It supports the PRD journeys "Signing up and getting started", "Recovering a forgotten password", and "Managing and deleting an account".

## 4. Scope and non-scope

### In scope

- `/signup`: invite-gated account creation (invite code, first name, last name, email, password; hidden device timezone) and its closed state.
- `/login`: extended (heading, forgot-password link, signup link, notices, specific error mapping).
- Sign out (existing action) and an account-menu entry for Settings.
- `/forgot-password`, the `/auth/confirm` route handler, `/reset-password`, and the Supabase recovery email template.
- `/settings`: edit first name, last name, timezone; read-only email; the entry to deletion.
- `/settings/delete-account`: inventory, password confirmation, deletion.
- The auth-admin facade, the invite-code module, the account-deletion module, guard-test updates for their sanctioned exceptions, and the isolation-suite extension for deletion.
- Local Supabase config: recovery template, `[auth]` remains `enable_signup = false`.
- `.env.example` documentation for the new server-only variables.

### Out of scope

- Onboarding tour, welcome screen, greeting, appearance setting, mobile navigation redesign (Pitches 10–11). **Deferred.**
- What's New. **Deferred.**
- Plan seeding (operator task, not a feature). **Not a pitch.**
- Email verification, social login, MFA, changing email, changing password from Settings, per-friend invite codes, invite-management UI, roles, admin interface, billing. **Permanent non-goals** (roadmap "deliberately not planned"), except per-friend codes (**not chosen**, R5).
- Enabling signup in production, configuring production SMTP/DNS, setting production secrets. **Human runbook steps.**
- Any schema change to training models; the progression engine; logged-history writes.

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| Auth identity | A Supabase Auth user (email, password hash, sessions). `id` = the account's `userId`. Created only by the signup action through the auth-admin facade, with `email_confirm: true`. Deleted only by the account-deletion module. |
| `Profile` | Existing model (Multi-User Foundation): one per account, `userId` PK; `firstName`, `lastName` (nullable in the schema; required by signup and Settings), `timeZone` (IANA, the only authority for "today"). The ownership root: every owned row references it with `Restrict`. |
| Invite code | One shared secret string in the server-only env var `OVERLOAD_INVITE_CODE`. Signup is **open** only when it is set and at least `INVITE_CODE_MIN_LENGTH` (12) characters long after trimming; otherwise signup is **closed**. Compared in constant time. Rotated by changing the env var. Never stored, logged, echoed, or sent to the browser. |
| Recovery session | The auth session created when `/auth/confirm` verifies a recovery `token_hash`. Recognised by its JWT `amr` entry with method `otp` or `recovery` whose timestamp is within `RECOVERY_SESSION_MAX_AGE_SECONDS` (1800). Overload has no other OTP/magic-link login, so an `otp` amr can only come from recovery (verified locally: `verifyOtp({type:"recovery"})` → `amr: [{method:"otp"}]`; password login → `[{method:"password"}]`). |
| Auth-admin facade | `src/lib/supabase/admin.ts`, `server-only`: `createConfirmedUser({ email, password })` and `deleteAuthUser(id)`, backed by a service-role Supabase client created per call (no session persistence). The only module that reads `SUPABASE_SERVICE_ROLE_KEY` in `src/`. Imported only by the signup module and the account-deletion module. |
| Account-deletion module | `src/lib/accounts/deletion.ts`: the single sanctioned destroyer of logged history (CLAUDE.md). Deletes the acting account's owned rows through `account.db` (the scoped client, so every `deleteMany` is intersected with `userId = acting`) in `ACCOUNT_DELETION_ORDER`, in one transaction, then deletes the auth identity. |
| Account inventory | Counts of the acting account's mesocycles, logged sessions, logged sets, goals, gyms, custom exercises, cardio logs — computed on read for the delete page. Not stored. |

**Distinctions to preserve:**

- **Auth session ≠ `Session`.** `Session` is the planned workout template. This spec says "auth session" everywhere.
- **Recovery session vs ordinary session.** Only a recovery session may set a password without the old one; an ordinary password session opening `/reset-password` sees the expired-link state.
- **Account deletion vs archive.** Every other removal in Overload is an archive. Account deletion is the one hard delete, sanctioned only in its module, and only of the acting account's rows.
- **Library vs custom `Exercise`.** Deletion removes the account's custom exercises (owner = acting) and never touches library rows (owner = null), guaranteed by the scoped client's write filter.

## 6. States and lifecycle

### Signup availability

```text
closed   OVERLOAD_INVITE_CODE unset or shorter than 12 chars (trimmed)  → /signup renders "Signup isn't open"; the action refuses
open     OVERLOAD_INVITE_CODE set, ≥ 12 chars                          → invite-gated signup
```

Production starts **closed** and stays closed until the operator sets the variable after the Multi-User Foundation production gate passes (runbook).

### Account lifecycle

| From | To | Trigger | Side effects (atomicity) |
| ---- | -- | ------- | ------------------------ |
| (none) | auth user only | `createConfirmedUser` succeeded | transient, same request |
| auth user only | **active account** (auth user + profile + auth session) | sign-in + profile create succeeded | if either fails: `deleteAuthUser` (compensation) → back to (none); response "Couldn't create your account. Nothing was saved." |
| active | active | Settings save | `Profile` update (scoped) |
| active | active (new password) | recovery reset | password changed; other auth sessions revoked (`signOut({ scope: "others" })`) |
| active | **data deleted, identity remains** | deletion transaction committed, auth delete failed | the lifter sees "Your training data was deleted, but closing your account didn't finish. Try again to finish."; retry is idempotent |
| active / data-deleted | **(none)** | deletion transaction + `deleteAuthUser` succeeded (or auth reports `user_not_found`) | final profile sweep; auth cookies cleared; redirect `/login?notice=deleted` |

The deletion transaction is all-or-nothing: if any delete fails, nothing is deleted and the response is "Couldn't delete your account. Nothing was deleted. Try again."

### Recovery link

```text
issued (email) → verified once by /auth/confirm → recovery session (≤ 30 min) → password set
               ↘ invalid / expired (otp_expiry 3600 s) / reused → /forgot-password?link=expired
```

## 7. UI integration

The design doc (v1.0) and the UI preview are the contract; the implementation follows the preview's hierarchy, copy, states, and responsive behavior. Screen → frame mapping: preview §01 (Login), §02 (Signup), §03 (Recovery), §04 (Settings, account menu), §05 (Delete).

### Screens

| Screen | Route | Server data | Actions |
| ------ | ----- | ----------- | ------- |
| Login | `/login` | `searchParams.notice` (`deleted`) | `signInAction` |
| Signup | `/signup` | `isSignupOpen()` (boolean only) | `signUpAction` |
| Forgot password | `/forgot-password` | `searchParams.email` (prefill), `searchParams.link` (`expired`) | `requestPasswordResetAction` |
| Confirm (route handler) | `GET /auth/confirm?token_hash&type` | — | verifies, redirects |
| Reset password | `/reset-password` | recovery-session check; the session's own email | `setNewPasswordAction` |
| Settings | `/settings` | profile (scoped), auth email (session), timezone list | `updateProfileAction` |
| Delete account | `/settings/delete-account` | inventory (scoped counts) | `deleteAccountAction` |
| Account menu | header | — | link to `/settings`; `signOutAction` |

All unauthenticated screens share `AuthCard` (the current login composition extracted: `min-h-dvh` centered `max-w-sm` column, `OverloadLockup size="lg"`, `rounded-lg border bg-card p-6` card, optional footer line).

### Components

| Component | Kind | Data contract / notes |
| --------- | ---- | --------------------- |
| `AuthCard` | server | `{ children, footer?: ReactNode }` |
| `PasswordInput` | client | wraps `Input`; ghost icon `Button` toggles `type`, `aria-pressed`, label "Show password"/"Hide password"; forwards `name`, `autoComplete`, `aria-*` |
| `LoginForm` | client | `useActionState(signInAction)`; state `{ error: string \| null, email: string }` (existing) |
| `SignupForm` | client | sets hidden `timeZone` from `Intl.DateTimeFormat().resolvedOptions().timeZone` on mount; state `SignUpState` (§11) |
| `SignupClosed` | server | static |
| `ForgotPasswordForm` | client | request/sent states; focus moves to the "Check your email" heading |
| `ResetPasswordForm` | client | email prop (session's own) |
| `ResetLinkExpired` | server | static |
| `ProfileForm` | client | `{ firstName, lastName, email, timeZone, timeZones: string[] }`; device-zone hint computed after mount (no hydration mismatch); Save disabled until dirty |
| `NativeSelect` | UI primitive (new, `src/components/ui/native-select.tsx`) | shadcn native-select recipe: native `<select>` styled as `Input` + `ChevronDown`; `h-11` |
| `DeleteAccountForm` | client | `{ inventory: AccountInventoryDto }`; button disabled until the password is non-empty |
| `AccountMenu` | client (existing) | + `Settings` item (`Settings` icon, `Link href="/settings"`) above Sign out |

### Forms and validation (client mirrors server; server is authoritative)

| Form | Field | Type | Required | Validation |
| ---- | ----- | ---- | -------- | ---------- |
| Signup | `inviteCode` | text | yes | non-empty; checked on the server only |
| Signup | `firstName`, `lastName` | text | yes | trimmed 1–50 chars (`PROFILE_NAME_MAX = 50`) |
| Signup | `email` | email | yes | trimmed, lowercased; `EMAIL_RE` shape; ≤ 254 |
| Signup | `password` | password | yes | non-empty client-side; the auth service enforces its minimum (6 by default, `PASSWORD_MIN_LENGTH` mirrors it for copy) |
| Signup | `timeZone` | hidden | no | `isValidTimeZone`, else `DEFAULT_PROFILE_TIME_ZONE` ("UTC") |
| Login | `email`, `password` | | yes | non-empty (existing `parseCredentials`) |
| Forgot | `email` | email | yes | non-empty + shape only |
| Reset | `password` | password | yes | non-empty; service rules |
| Settings | `firstName`, `lastName` | text | yes | trimmed 1–50 |
| Settings | `timeZone` | select | yes | `isValidTimeZone` |
| Delete | `password` | password | yes | non-empty |

### shadcn/ui integration

- Inputs `h-11`; primary buttons `h-11 w-full`; destructive delete uses `Button variant="destructive"`; the Settings entry is `variant="outline"` with destructive text (preview recipe `ov-btn--outline-destructive`).
- Errors: field-level `p role="alert" text-sm text-destructive` linked via `aria-describedby`; form-level `Alert variant="destructive"`; neutral notices `Alert` default.
- Forms submit through `onSubmit` + `startTransition(formAction)` (the gym-form pattern) so React 19 does not reset typed values on failure; password fields are intentionally cleared on failure.
- Settings and Delete render inside the existing `AppShell`; on phones the primary action sits in a sticky bottom bar above the nav (`fixed`/`sticky` within `main` with `pb` clearance), at `md+` inline at the end.
- `loading.tsx` skeletons for `/settings` and `/settings/delete-account` shaped as in the preview.
- Toasts: "Settings saved" (success, 4 s); "Password updated." (success, 4 s, shown on Today via `?notice=password-updated`, stripped after display like `CreatedToast`); save failure error toast until dismissed.

## 8. Data model

**No schema change and no migration.** `Profile` already has `firstName String?`, `lastName String?`, `timeZone String` (Multi-User Foundation). Names stay nullable in the schema because the original account's profile has none; signup and Settings require them (R10). No new table ⇒ no new RLS statement; RLS stays deny-all on every table and the RLS integration test keeps proving it.

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| auth.users (Supabase) | 1 : 1 (by id, no FK) | `Profile` | Created together at signup, deleted together by the deletion module |
| `Profile` | 1 : N, `Restrict` | every owned model | the reason deletion must be ordered |

### Deletion order (`ACCOUNT_DELETION_ORDER`, children before parents)

| # | Model | References that force the position |
| - | ----- | ---------------------------------- |
| 1 | `LoggedSet` | → LoggedExercise |
| 2 | `LoggedExercise` | → LoggedSession, Exercise ×2, SessionExercise, Gym |
| 3 | `GymExerciseBaseline` | → Gym, Exercise |
| 4 | `Goal` | → Exercise, Gym |
| 5 | `CardioLog` | → Mesocycle |
| 6 | `MissedDayResolution` | → Mesocycle, Session |
| 7 | `LoggedSession` | → Mesocycle, Session |
| 8 | `PlannedCardio` | → Mesocycle |
| 9 | `SessionExercise` | → Session, Exercise |
| 10 | `Session` | → Mesocycle |
| 11 | `Mesocycle` | → Profile |
| 12 | `ExerciseFavorite` | → Exercise (incl. library) |
| 13 | `Exercise` (custom only; scoped write filter) | → Profile |
| 14 | `Gym` | → Profile |
| 15 | `Profile` | root |

A unit test asserts the order contains every owned model from the DMMF (`ownedModels()` ∪ `Exercise`) exactly once, so a future owned model cannot be forgotten; the integration test proves the order satisfies every FK on a fully populated account.

### Derived fields

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| Signup open | no | `OVERLOAD_INVITE_CODE` | boolean only ever leaves the server |
| Recovery session | no | auth JWT `amr` | §5 |
| Account inventory | no | scoped `count()` per model | delete page only |

## 9. Authorization and access control

| Resource / operation | Who | Enforcement |
| -------------------- | --- | ----------- |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `GET /auth/confirm` | anyone | `proxy.ts` `PUBLIC_PATHS`; signed-in users opening `/login`, `/signup`, `/forgot-password` are redirected to `/` |
| everything else | authenticated | proxy (optimistic) + `requireAccount()` in the `(app)` layout and **every** server action |
| create account | anyone with a valid invite code, only while signup is open | `signUpAction` → `checkInviteCode` before any auth call; Supabase project signup stays disabled so the anon key cannot create users (verified locally: anon `signUp` → `signup_disabled`) |
| read/update own profile | the acting account | `account.db.profile` (scoped; another account's profile is unreachable) |
| set a password without the old one | a recovery session ≤ 30 min old | `isRecoverySession(claims, now)` on the page **and** in the action |
| delete account | the acting account, after re-entering its password | `requireAccount()`; email taken from the auth session (never the form); password verified with a stateless client; no id/email accepted from input |
| service-role key | server only | `src/lib/supabase/admin.ts` (`server-only`); guard tests; client-bundle scan |

Rules carried from CLAUDE.md: identity only from the session (the one exception is the signup action's first profile write, which uses the user returned by the auth service's own `signInWithPassword` response in the same request — never client input, R9); another account's data is indistinguishable from missing; the Supabase client is used for auth only (no `.from()`).

## 10. Storage model

Not applicable (no Storage change).

## 11. Server actions and API surface

All results follow `ActionResult`/form-state conventions (`src/lib/actions/result.ts`); messages are plain English; no Supabase error text, code, or email reaches the browser; server logs carry error **codes** only (never names, emails, or codes).

```ts
// src/app/signup/actions.ts
type SignUpField = "inviteCode" | "firstName" | "lastName" | "email" | "password";
type SignUpState = {
  status: "idle" | "error" | "closed";
  fieldErrors: Partial<Record<SignUpField, string>>;
  formError: "email_taken" | "unexpected" | null;
  values: { inviteCode: string; firstName: string; lastName: string; email: string }; // never the password
};
// signUpAction(prev, formData): Promise<SignUpState>  — redirect("/") on success
// Order: parse → isSignupOpen → checkInviteCode (stop on failure, return ONLY the invite error)
//        → createConfirmedUser → signInWithPassword (cookie client) → establishProfile(user, {names, tz})
//        → redirect("/"). Failure after createConfirmedUser → deleteAuthUser + signOut → "unexpected".
// Mapping: email_exists → formError "email_taken"; weak_password → fieldErrors.password
//          "Use at least 6 characters."; email_address_invalid/validation_failed → fieldErrors.email.
```

```ts
// src/app/login/actions.ts (extended)
// signInAction: invalid_credentials (and any 400) → "Wrong email or password.";
//   over_request_rate_limit / 429 → "Too many attempts. Wait a minute and try again.";
//   network/other → "Couldn't sign in. Check your connection and try again."
// signOutAction: unchanged.
```

```ts
// src/app/forgot-password/actions.ts
type ForgotState = { status: "idle" | "sent" | "invalid"; email: string; error: string | null };
// requestPasswordResetAction(prev, formData): Promise<ForgotState>
// Invalid shape → { status: "invalid", error }. Otherwise ALWAYS { status: "sent", email } —
// regardless of resetPasswordForEmail's outcome (ok, unknown email, over_email_send_rate_limit,
// network error), which is logged by code only. Verified locally that the service itself
// returns an error only for a KNOWN address (per-user 429), which is why it must be swallowed.
```

```ts
// src/app/auth/confirm/route.ts — the one route handler (an auth callback)
// GET ?token_hash=…&type=recovery
//   type !== "recovery" or no token → 303 /forgot-password?link=expired
//   verifyOtp({ type: "recovery", token_hash }) ok → 303 /reset-password (session cookies set)
//   error (otp_expired, invalid) → 303 /forgot-password?link=expired
```

```ts
// src/app/reset-password/actions.ts
type ResetState = { status: "idle" | "error" | "expired"; fieldError: string | null; formError: string | null };
// setNewPasswordAction(prev, formData): Promise<ResetState>
// Re-checks isRecoverySession; else { status: "expired" }.
// updateUser({ password }): weak_password → "Use at least 6 characters.";
//   same_password → "Choose a password you haven't used here."; other → formError.
// Success → signOut({ scope: "others" }) (failure logged, not fatal) → redirect("/?notice=password-updated").
```

```ts
// src/app/(app)/settings/actions.ts
type ProfileFormState = {
  result: ActionResult<{ saved: true }> | null;
  values: { firstName: string; lastName: string; timeZone: string };
};
// updateProfileAction(prev, formData): requireAccount → updateProfile(account, input) → refresh()
// src/lib/accounts/profile.ts: updateProfile(account, input, tx?) — scoped update of the acting
//   profile only; validation_error with details.{firstName,lastName,timeZone}.
```

```ts
// src/app/(app)/settings/delete-account/actions.ts
type DeleteAccountState = {
  status: "idle" | "error";
  fieldError: string | null;                 // "That password isn't right."
  formError: "nothing_deleted" | "identity_pending" | "rate_limited" | null;
};
// deleteAccountAction(prev, formData):
//   account = requireAccount(); email = (await requireUser()).email  // session, never the form
//   verifyCurrentPassword(email, password)    // stateless anon client, persistSession:false
//   result = deleteAccount(account)           // src/lib/accounts/deletion.ts
//   result.identityRemoved ? (signOut(); redirect("/login?notice=deleted"))
//                          : { formError: "identity_pending" }  (+ refresh so the inventory reads empty)
```

```ts
// src/lib/accounts/deletion.ts — the account-deletion module
export const ACCOUNT_DELETION_ORDER: readonly AccountDeletionModel[]; // §8
export type AccountDeletionResult = { deleted: Record<AccountDeletionModel, number>; identityRemoved: boolean };
export async function deleteAccount(
  account: Account,
  deps: { deleteAuthUser: (id: string) => Promise<"deleted" | "not_found"> } = defaultDeps,
): Promise<AccountDeletionResult>;
// 1. account.db.$transaction(tx => for model of ORDER: tx[model].deleteMany({})) — scoped, one tx,
//    timeout 30 s. Any failure → throws (nothing deleted).
// 2. deps.deleteAuthUser(account.userId): "deleted" | "not_found" → identityRemoved = true;
//    throws → identityRemoved = false (data stays deleted; retry finishes).
// 3. If identityRemoved: account.db.profile.deleteMany({}) again (sweeps a profile a concurrent
//    request may have lazily recreated between steps 1 and 2).
export async function accountInventory(account: Account): Promise<AccountInventoryDto>;
```

```ts
// src/lib/supabase/admin.ts — server-only auth-admin facade
export async function createConfirmedUser(input: { email: string; password: string }):
  Promise<{ ok: true; user: { id: string } } | { ok: false; code: string }>;
export async function deleteAuthUser(id: string): Promise<"deleted" | "not_found">; // throws otherwise
```

```ts
// src/lib/accounts/invite.ts
export const INVITE_CODE_MIN_LENGTH = 12;
export function isSignupOpen(env = process.env): boolean;
export function checkInviteCode(candidate: unknown, env = process.env): "ok" | "missing" | "invalid" | "closed";
// sha256 both sides, crypto.timingSafeEqual; both trimmed; case-sensitive.

// src/lib/accounts/recovery.ts
export const RECOVERY_SESSION_MAX_AGE_SECONDS = 1800;
export function isRecoverySession(claims: { amr?: { method: string; timestamp: number }[] } | null, nowSeconds: number): boolean;

// src/lib/data/account.ts (data layer)
export async function establishProfile(user: { id: string }, input: { firstName: string; lastName: string; timeZone: string }): Promise<void>;
// create; on unique violation (a lazy profile raced in) update names + zone.
```

### Error codes used

| Code | Where |
| ---- | ----- |
| `validation_error` | profile fields |
| `internal_error` | unexpected profile save failure ("Couldn't save. Your changes are still here.") |
| form-state codes above | auth forms (they carry field/form errors rather than `ActionResult`, matching the existing login form) |

## 12. Validation rules

| Field | Validation | Error copy |
| ----- | ---------- | ---------- |
| invite code | present | "Enter the invite code." |
| invite code | equals configured code (constant time) | "That invite code isn't valid." |
| first / last name | trimmed, 1–50 | "Enter your first name." / "Enter your last name." / "Use 50 characters or fewer." |
| email | trimmed, lowercased, `^[^\s@]+@[^\s@]+\.[^\s@]+$`, ≤ 254 | "Enter your email." / "Enter a valid email address." |
| password (signup, reset) | present; service minimum | "Enter a password." / "Enter a new password." / "Use at least 6 characters." |
| timezone (signup) | `isValidTimeZone` | silently falls back to UTC |
| timezone (settings) | `isValidTimeZone` | "Choose a timezone." |
| delete password | present; correct | button disabled / "That password isn't right." |

- The invite check runs before any email/name/password **service** check, and a wrong code returns only the invite error (presence errors for other empty fields are still shown on a fully empty submit, since they reveal nothing).
- No custom password-complexity rule exists (standing decision).

## 13. UI data contracts

```ts
type AccountInventoryDto = {
  mesocycles: number; loggedSessions: number; loggedSets: number; goals: number;
  gyms: number; customExercises: number; cardioLogs: number;
}; // rows with 0 are hidden; all 0 → "Your account has no training data yet."

type SettingsProfileDto = {
  firstName: string; lastName: string;   // "" when null (original account)
  email: string;                         // the session's own email
  timeZone: string;                      // stored, validated
  timeZones: string[];                   // Intl.supportedValuesOf("timeZone") ∪ {"UTC", stored}, sorted
};
```

The invite code, service-role key, token hashes, and raw Supabase errors never appear in any DTO or prop.

## 14. Testing strategy

Priorities follow CLAUDE.md → Testing: cross-account isolation first, logged-history integrity second, then auth/signup/RLS. External auth is mocked in unit tests; integration tests use the embedded throwaway Postgres; the end-to-end account lifecycle runs against the **local** Supabase stack only (never production).

### 14.1 Cross-account isolation (integration, `tests/integration/isolation/account-deletion.int.test.ts`)

```text
GIVEN accounts A and B, each with a full fixture (plan, sessions, planned exercises incl. a custom exercise,
      planned cardio, gyms incl. archived, baselines, logged sessions/exercises/sets, a missed-day resolution,
      goals active+archived, cardio logs, favorites on library exercises), plus the shared library
WHEN  deleteAccount(A) runs
THEN  every owned table has 0 rows for A, B's per-table counts AND value fingerprints are unchanged,
      the library row count and fingerprint are unchanged, A's profile is gone, identityRemoved = true,
      and deleteAuthUser was called exactly once with A's id
GIVEN the same fixture WHEN deleteAccount(B) THEN A is untouched (symmetry)
GIVEN B favorited the library exercise A also favorited WHEN deleteAccount(A) THEN B's favorite remains
```

- Profile update isolation: `updateProfile(A, …)` never changes B; B's profile is unreachable through A's client (extends `profile.int.test.ts`).
- Coverage registry: deletion is listed for every owned model (`ISOLATION_COVERAGE` gains `account-deletion.int.test.ts` everywhere).

### 14.2 Logged-history integrity (integration + unit guards)

```text
GIVEN a populated account WHEN one step of the deletion transaction fails (injected: deleteAuthUser not
      reached; a model's deleteMany throws mid-transaction) THEN nothing is deleted (counts + fingerprints equal)
GIVEN deleteAuthUser throws WHEN deleteAccount THEN all data is deleted, identityRemoved = false, and a second
      deleteAccount (identity now "not_found" or deleted) succeeds and is a no-op on data
GIVEN ACCOUNT_DELETION_ORDER THEN it equals ownedModels() ∪ {Exercise} as a set, each exactly once (unit)
GIVEN the source tree THEN LoggedSet writes occur only in lib/logging/logged-sets.ts and
      src/lib/accounts/deletion.ts (deleteMany only); Exercise/Gym hard deletes occur only in the deletion module
GIVEN the source tree THEN no file outside src/lib/accounts/deletion.ts calls a deleteMany on Profile
```

### 14.3 Signup and invite gate (unit)

- `checkInviteCode`: unset env → `closed`; < 12 chars → `closed`; missing → `missing`; wrong → `invalid`; trimmed match → `ok`; case-sensitive; uses `timingSafeEqual` (spy).
- `signUpAction`: closed → `status: "closed"`, no auth call; wrong code → only `fieldErrors.inviteCode`, **`createConfirmedUser` never called**; `email_exists` → `email_taken`; `weak_password` → password field; success → `createConfirmedUser`, `signInWithPassword`, `establishProfile(user, { names, tz })`, `redirect("/")`; invalid tz → UTC; establishProfile failure → `deleteAuthUser` + `signOut`, `unexpected`; the password is never in returned state.
- `establishProfile` (integration): creates names + zone; a pre-existing lazy UTC profile is updated, not duplicated.

### 14.4 Login, logout, recovery, enumeration (unit)

- `signInAction` error mapping (credentials/429/network) and unchanged success redirect.
- `requestPasswordResetAction` returns **deep-equal** state for: known email (ok), unknown email (ok), known email rate-limited (429), network failure (throws) — differing only in the echoed email; logs contain no email.
- `isRecoverySession`: password amr → false; otp amr fresh → true; otp older than 1800 s → false; missing claims → false; `recovery` method → true.
- `/auth/confirm`: wrong type / missing token / verify error → `/forgot-password?link=expired`; success → `/reset-password`.
- `setNewPasswordAction`: non-recovery session → expired (no `updateUser` call); same/weak mapping; success → `signOut({scope:"others"})` then redirect.
- `proxy`: public paths reachable signed out; signed-in redirect away from `/login`, `/signup`, `/forgot-password` but not `/reset-password` or `/auth/confirm`.

### 14.5 Settings (unit + integration)

- `updateProfile` validation (empty/over-long names, invalid zone) → `validation_error` with details; trims; writes only the acting profile; a zone change makes `accountToday` follow the new zone (integration).

### 14.6 Deletion action (unit)

- No password → no deletion call; wrong password → field error, `deleteAccount` never called; the email used for verification comes from the session even if the form posts an `email`/`userId` field; `identityRemoved:false` → `identity_pending`; success → `signOut` + `redirect("/login?notice=deleted")`; a thrown transaction → `nothing_deleted`.

### 14.7 Auth, signup, and RLS (standing)

- RLS integration suite stays green (no new table). Secret hygiene: no `NEXT_PUBLIC_` service-role/invite/SMTP variable; `OVERLOAD_INVITE_CODE` and `SUPABASE_SERVICE_ROLE_KEY` referenced in `src/` only by `invite.ts` and `admin.ts` respectively; `admin.ts` and `invite.ts` import `server-only`; `@/lib/supabase/admin` imported only by `src/lib/accounts/deletion.ts` and `src/lib/accounts/signup.ts`. `verify:client-bundle` additionally scans for the invite code value and the service-role key value when set.

### 14.8 End-to-end (Playwright)

- **Default config** (dummy Supabase, no invite code): unauthenticated redirect; login shows email, password, "Forgot password?" and "Create an account"; `/signup` renders "Signup isn't open"; `/forgot-password` renders; `/reset-password` renders the expired state; `/settings` redirects to login. *(Replaces Foundation's "no registration surface" tests, which this pitch intentionally supersedes — R17.)*
- **Local-stack lifecycle config** (`playwright.accounts.config.ts`, refuses any non-`127.0.0.1` Supabase/DB URL): sign up with the invite (wrong code rejected first) → empty Today → second account sees none of the first's data by URL → sign out → sign in → forgot password (Mailpit) → link → set new password → old password fails, new works → Settings name/zone save → delete with wrong then right password → login notice → the deleted credentials fail. 375 px and desktop screenshots compared by eye against the preview.

### 14.9 Regression

- The original account signs in exactly as before (`signInAction` unchanged contract); existing isolation, history-integrity, RLS, and progression suites stay green.

## 15. Acceptance criteria

### Signup (PRD AC 1–2; pitch AC-1, AC-2)
- [ ] With a valid invite code, a new person creates an account (first, last, email, password) with no email confirmation and lands on an empty Today.
- [ ] The new account sees none of any other account's data on any screen or by URL.
- [ ] A missing or wrong invite code is rejected, before any account lookup.
- [ ] With no invite code configured, `/signup` is closed and the action refuses.
- [ ] An email that already has an account fails with "An account with this email already exists…" (only after a valid code).
- [ ] The browser's timezone is stored on the new profile (UTC fallback).

### Login / logout (pitch §4.2–4.3; upstream AC gap)
- [ ] Existing and new accounts sign in; one message for unknown email and wrong password.
- [ ] Sign out ends access; protected pages then redirect to login.

### Password recovery (PRD AC 3; pitch AC-3)
- [ ] A reset request shows the identical response for known and unknown emails.
- [ ] A known address receives an email whose link verifies on `/auth/confirm` and allows setting a new password; the old password stops working; other sessions are signed out.
- [ ] An invalid, used, or expired link leads to "That reset link has expired…"; `/reset-password` without a recovery session shows the expired state.
- [ ] Delivery to a non-team address in production is verified by the runbook (human step).

### Settings (pitch §4.6–4.7; upstream AC gap)
- [ ] The lifter edits first name, last name, and timezone; changes apply only to their account; Today follows the saved zone.

### Deletion (PRD AC 4; pitch AC-4; failure states)
- [ ] Deletion requires the signed-in account's password and states what will be destroyed.
- [ ] Deleting removes all of that account's owned rows and its auth identity, and nothing else (other accounts and the library unchanged).
- [ ] A failure deletes nothing, or (identity step only) is reported honestly and finishes on retry.
- [ ] Nobody but the signed-in owner can start deletion (no id/email input accepted).

## 16. Explicit non-goals

- ❌ Email verification, social login, MFA. **Permanent.**
- ❌ Roles, admin interface, invite-management UI, open public signup, billing. **Permanent.**
- ❌ Per-friend invite codes. **Not chosen** (R5); revisit only by pitch.
- ❌ Changing email or password from Settings. **Not planned** (recovery covers password).
- ❌ Onboarding tour, greeting, appearance, mobile nav, What's New. **Deferred** to Pitches 10–12.
- ❌ Undo or grace period for deletion. **Not planned** (the pitch defines deletion as permanent).
- ❌ Program generation, social features, cardio progression, nutrition. **Permanent.**

## Resolved Decisions

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | Controlling planning docs are the owner's approved multi-user set in `Downloads/` (2026-10-13), as in Pitch 8 R1; `docs/planning/` is not edited. | The pitch traces to the PRD "Accounts" feature and Architecture "Auth & Identity" text that exist only there. | Pitch 8 R1 (standing); `.claude/CLAUDE.md` |
| R2 | Invite gate = one shared code in server-only `OVERLOAD_INVITE_CODE`, sha256 + `timingSafeEqual`, trimmed, case-sensitive; signup is **closed** when unset or < 12 chars. | Standing decision (pitch §13); closed-by-default doubles as the production gate (no code ⇒ no signup) without a second flag; the length floor makes guessing impractical with no rate-limit infrastructure. | Pitch §4.1, §13; Architecture Open Question default |
| R3 | Accounts are created server-side with the Supabase **admin API** (`createUser`, `email_confirm: true`); the Supabase project's public signup stays **disabled** in every environment. | If project signup were enabled, the anon key that ships to every browser could call `/auth/v1/signup` and bypass the invite gate (verified locally: anon `signUp` → `signup_disabled` while disabled). Admin creation also satisfies "no email confirmation". | CLAUDE.md "no open public signup"; stop condition 1 avoided |
| R4 | The app now reads `SUPABASE_SERVICE_ROLE_KEY` at runtime, **only** in `src/lib/supabase/admin.ts` (`server-only`), imported only by signup and account deletion. This supersedes the Library & Gyms decision "never referenced under `src/`, never set in Vercel"; its guard test is narrowed to exactly that file, and new guards pin the importers. The run used only the local stack's key; setting the production key in Vercel is a human runbook step. | Creating an invite-gated user (R3) and removing a deleted account's auth identity both require admin rights; CLAUDE.md lists the service-role key among server-only secrets, anticipating server use. Flagged for human review in the run report. | CLAUDE.md Secrets; Architecture "Accounts — sign up…delete the account" |
| R5 | Not per-friend codes (no table, no used marker). | Standing decision; per-friend tokens are listed under "overbuilding" (pitch §8.8). | Pitch §8.8, §13 |
| R6 | Password rules are Supabase's (default minimum 6); `PASSWORD_MIN_LENGTH = 6` exists only to word the helper text and must match the project setting (runbook check). | Standing decision: no custom complexity. | Pitch §4.5, §13 |
| R7 | Recovery uses a custom email template linking to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`, verified server-side with `verifyOtp`. | The default template's link redirects with tokens in the URL fragment (implicit flow), unreadable by a server-first app; PKCE would break when the link is opened on another device. token_hash works cross-device. | Supabase SSR pattern; Architecture "server-first" |
| R8 | A recovery session = JWT `amr` method `otp`/`recovery` within 1800 s; required by both `/reset-password` and `setNewPasswordAction`. After a reset, other sessions are revoked (`signOut({scope:"others"})`). | Without it any signed-in device could change the password without knowing it. Verified locally that recovery yields `otp` and password login yields `password`; Overload has no other OTP login. Revoking other sessions is the expected security outcome of a reset. | Pitch §4.5; PRD journey |
| R9 | The new account's first profile write uses the user returned by the auth service's `signInWithPassword` in the same request (`establishProfile` in `src/lib/data`), not `requireAccount()`. | The session cookie written in a server action is not guaranteed readable by a fresh `getUser()` in the same request; the auth response is server-verified identity, never client input. Lives in the data layer, so the "userId only as account.userId outside src/lib/data" guard holds. | CLAUDE.md "Identity comes from the session" |
| R10 | `Profile.firstName/lastName` stay nullable in the schema; signup and Settings require 1–50 trimmed characters. No migration. | The original account has no names (Pitch 8 R17); making them NOT NULL would need a backfill of invented data. | Pitch 8 R17; pipeline stop condition 4 (no destructive/ data-altering migration) |
| R11 | Timezone: captured from the browser at signup (hidden field; invalid → UTC); edited in Settings with a native select of `Intl.supportedValuesOf("timeZone")` ∪ UTC ∪ the stored zone; a device-mismatch hint never auto-changes the value. The original account's zone is the one Pitch 8's backfill set. | Standing decision; the stored zone remains the only "today" authority (no second mechanism). Native select because 400+ zones are unusable in a custom popover on phones. | Pitch §4.6, §12; Architecture Open Question default |
| R12 | Deletion = `src/lib/accounts/deletion.ts`, deleting through the **scoped** `account.db` in `ACCOUNT_DELETION_ORDER` in one transaction (30 s timeout), then the auth identity via the admin facade, then a profile sweep. Data first, identity second. | One transaction for all owned rows (CLAUDE.md). The scoped client makes it impossible to delete another account's rows or a library exercise even with a bug. Data-first means the worst failure leaves an empty, still-sign-in-able account the lifter can finish deleting — never orphaned personal data without an owner able to remove it. | CLAUDE.md "Deleting an account"; pitch §8.5–8.6 |
| R13 | Deletion confirmation = a dedicated page with counts + the account password (re-verified with a stateless client against the session's own email). No typed phrase, no undo. | The password proves the signed-in owner is present (PRD edge case) and is a deliberate act; counts communicate the consequence (pitch §8.7). | Design doc Screen 7; PRD |
| R14 | Forgot-password always answers "sent" for any well-formed email, swallowing service errors (incl. the per-user 429 that only known emails get); errors are logged by code only. | The service itself leaks membership through its rate-limit error (verified locally); the PRD requires identical responses. | PRD edge case; pitch §8.4 |
| R15 | Transactional email: Resend via Supabase custom SMTP with a verified sending domain, configured by a human in the `overload-prod` dashboard; locally Supabase's Mailpit receives all mail. No email code in the app. | Architecture default; "Nothing else sends email." | Architecture External Integrations; CLAUDE.md Email |
| R16 | Settings is reached from the account menu (new "Settings" item); no primary-navigation item. | The pitch forbids a navigation redesign and reuses the existing structure. | Pitch §4.7, §6 |
| R17 | Foundation's e2e assertions "login has no registration affordance" and "/signup redirects to /login" are replaced by the new contract (signup link exists; `/signup` closed without a code). | Product change mandated by the approved pitch — not a weakened test; the security intent (no ungated registration) is re-asserted by the closed-state and invite tests. | Pitch; CLAUDE.md Access and registration model |
| R18 | The UI preview is `docs/previews/09-…-preview.html`, not the run prompt's `.tsx`. | The `overload-ui-design` skill and the owner's recorded feedback require static HTML previews. | overload-ui-design skill; owner feedback |
| R19 | The `overload-ui-design` Login guidance ("no sign-up link, no forgot flourish") is superseded for this pitch. | Multi-user CLAUDE.md and the pitch require both links. Upstream amendment. | `.claude/CLAUDE.md`; pitch |
| R20 | Five tickets, stacked: (1) auth surfaces + login/logout + Settings profile/timezone; (2) invite-gated signup + admin facade; (3) password recovery; (4) account deletion; (5) local-stack lifecycle e2e + hardening. | Vertical, medium-large PRs in dependency order. | Run prompt; ticket-worker skill |
| R21 | The run stops before merging to `main`; it never sets production env vars, SMTP, or Supabase settings. | Run prompt; stop condition 3. | Run prompt; CLAUDE.md |
| R22 | Root `CLAUDE.md` (single-user) is not edited; `.claude/CLAUDE.md` governs. | Owner's uncommitted file; Pitch 8 report §9. | Pitch 8 standing |
| R23 | *(added in OVE-43)* A reset request answers in no less than `RESET_REQUEST_MIN_MS` (1500 ms). | With custom SMTP the auth service sends a known address's email before it replies, so a known address would answer measurably slower than an unknown one; the floor equalizes timing as well as wording. Measured locally: known 1883 ms, unknown 1965 ms. | PRD edge case "looks identical"; pitch §8.4 |
| R24 | *(added in OVE-43)* Known limitation accepted: within the 30-minute recovery window, the browser that followed the link can set a password again without the old one. | It is the device that just proved control of the email; closing it would need extra server state for little gain. Reported for review. | Pitch §8.8 (no overbuilding) |

## 17. Open questions

1. *(non-blocking)* **Server-side rate limiting.** Login and password checks are made from the server, so Supabase's per-IP limits see Vercel's IPs. Default: rely on Supabase's limits and the long invite code; revisit (e.g. Vercel Firewall rule on `/signup`, `/login`) if abuse appears. Listed in the run report.
2. *(non-blocking)* **Production sending domain.** Which domain the owner verifies with Resend is an operator choice (runbook); the template uses the sender configured in Supabase.

## 18. Future considerations

- Personalization (Pitch 10) reads `Profile.firstName` for the greeting; this spec guarantees new accounts have one and Settings lets the original account add one.
- The Onboarding Tour and What's New add `TourProgress` and `ReleaseSeen` (owned models): they must be added to `ACCOUNT_DELETION_ORDER` — the unit test fails until they are.
- Plan seeding (operator) can target a friend's account immediately after signup, by email.
- The iOS shell (Pitch 17) reuses the same auth session and the token_hash recovery route.
