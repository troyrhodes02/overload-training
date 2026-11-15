# App Shell, Design System & Accounts — Technical Specification

**Pitch:** 21d — App Shell, Design System & Accounts (`pitch.md`)
**Design:** `design.md` in this folder. Its §15 (Mobile design) is the binding native visual contract. There is no `preview.tsx`, because a mobile-only slice's visual contract is the design doc's Mobile design section (pipeline guide §5, step 3; `overload-mobile-ui`).
**Milestone:** MVP 5B — Mobile App · **Appetite:** M · **Run date:** 2026-11-14
**Client scope:** Native iOS (`apps/mobile`, new) plus additive mobile API endpoints in `apps/web`
**Plan placement:** Free. No capability gates anything here, and plan state is read-only.

---

## 1. Summary

21d turns `apps/mobile` into a working Expo SDK 58 app (React 19.3.0, React Native 0.88.1, Hermes) that:

- signs in with Supabase Auth and keeps the session in the Keychain;
- talks only to `/api/mobile/v1` with the bearer token and `X-Overload-App-Version`;
- shows native gates for update required, maintenance, unreachable, suspended, and staging access;
- offers native sign-in, signup with an embedded Turnstile challenge, and the password-reset request;
- renders a system tab bar with honest placeholders for 21e–21j.

The web gains three additive endpoints that wrap the existing `signUp`, `requestPasswordReset`, and `updateAppearance` modules, plus one additive app-config field. Development builds reach the Vercel-protected staging deployment through a per-device access key that never enters source, configuration, a build, or an update. Every 21d artifact is staging-only, enforced at config time, at build time, and at runtime.

## 2. Problem

See `pitch.md` §1. The backend is ready (21c), but no lifter can install anything. The technical risks are Expo coexisting with Next in one workspace, keeping a session safely across outages, staging behind Deployment Protection, native signup under Turnstile, and Hermes time zones.

## 3. Scope and non-scope

### In scope
- `apps/mobile`: an Expo Router app, the theme and primitives, the account screens, the gates, placeholders, Diagnostics, the API client, the auth session, the staging access key, and EAS config (`development` and `development-simulator` profiles, `staging` update channel).
- `packages/shared`: `AppConfigDto.botChallenge`; `SignUpRequestDto`, `SignUpResponseDto`, `PasswordResetRequestDto`, `PasswordResetResponseDto`, and `AppearanceRequestDto`; the sign-in messages moved from `apps/web/src/app/login/credentials.ts`; and the mobile environment allowlist.
- `apps/web`: `POST /api/mobile/v1/accounts`, `POST /api/mobile/v1/password-reset`, `PUT /api/mobile/v1/me/appearance`, `botChallenge` in app-config, a third pipeline wrapper for version-gated public writes, and registry, guard, and isolation coverage.
- The workspace boundary script learns about Expo (B4 unchanged, plus B8 and B9 in §13).
- The Hermes time-zone spike (§12).

### Out of scope
Everything in `pitch.md` §5 "Out of scope". Also: a native store or TestFlight build, a Production EAS channel or profile, App Attest, per-device signup identifiers, associated domains and universal links (21l), push notifications, analytics and crash reporting, and rendering `me.tour`, `me.whatsNew`, or `me.trialNotice`.

## 4. Core concepts

| Term | Meaning |
| --- | --- |
| **App environment** | Exactly `staging` for every 21d artifact (`EXPO_PUBLIC_OVERLOAD_ENV`). A `production` value does not exist in this slice, and the config refuses it. |
| **Gate** | A full-screen blocking state decided by the root layout before any tab renders (design §4, G1–G6). |
| **Staging access key** | A Vercel "Protection Bypass for Automation" secret dedicated to mobile development, entered once per device, stored in the Keychain, and sent only to the staging API host as `x-vercel-protection-bypass`. |
| **Definitive auth failure** | The auth service rejected the refresh token (`AuthApiError` with status 400 or 401, for example `refresh_token_not_found` or `invalid_grant`), or the user signed out. The only reasons a session is cleared. |
| **Temporary failure** | A network error, timeout, any 5xx, a 408 or 429 from Auth (`AuthRetryableFetchError`), a non-JSON answer, or a Vercel protection page. The session is kept. |

## 5. States and lifecycle

**Root gate machine** (`apps/mobile/src/app-state/gate.ts`, pure, unit-tested). The design §4 lists the inputs in order. Output is one of `launching | misconfigured | update_required | maintenance | staging_access | unreachable | signed_out | suspended | signed_in`.

```ts
type GateInput = {
  envOk: boolean;                       // runtime environment guard (§7)
  config: Loadable<AppConfigDto>;        // app-config query
  session: "restoring" | "none" | "present";
  me: Loadable<MeDto> | "idle";
  appVersion: string;                    // Constants.expoConfig.version
  protectedByVercel: boolean;            // last API answer was a Vercel protection page
  upgradeRequiredSeen: boolean;          // any call answered 426
};
```

The rules, in order:
1. `!envOk` → `misconfigured`.
2. While the session is restoring, or the config is loading with nothing cached → `launching`.
3. `upgradeRequiredSeen`, or `appVersion < config.minimumAppVersion` → `update_required`.
4. `config.killSwitches.maintenance` → `maintenance`.
5. `protectedByVercel` → `staging_access`.
6. The config failed and there is no session → `unreachable`.
7. No session → `signed_out`.
8. `me` failed with `account_suspended` → `suspended`.
9. `me` is still loading → `launching`.
10. `me` failed (not 401) → `unreachable`.
11. Otherwise → `signed_in`.

If the config fails but a session exists, the app proceeds to `me` (rule 6 doesn't apply), so a flaky config endpoint never blocks a signed-in lifter who can reach `me`.

**Session lifecycle.** The client is `createClient(url, anonKey, { auth: { storage: SecureStoreAdapter, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`. `AppState` change → `startAutoRefresh()` on active and `stopAutoRefresh()` otherwise (Supabase's documented React Native pattern). `onAuthStateChange` drives the `session` input and clears the React Query cache on `SIGNED_OUT`. supabase-js keeps the stored session on `AuthRetryableFetchError` and removes it only on a definitive refusal. The app adds no sign-out of its own beyond the user's "Sign out".

## 6. Mobile API client (`apps/mobile/src/api/client.ts`)

`apiRequest<T>(path, { method, body, auth: boolean, signal })`:

1. The URL is `${API_BASE_URL}/api/mobile/v1${path}`. Headers: `Accept: application/json`, `X-Overload-App-Version: <app version>` on **every** request (app-config included), `Content-Type: application/json` when there is a body, `Authorization: Bearer <access token>` when `auth`, and `x-vercel-protection-bypass: <key>` only when a staging access key is stored **and** the request host equals the staging API host (§7).
2. The access token comes from `supabase.auth.getSession()`, which refreshes an expired token first. There is no session for an `auth` call → `ApiError("unauthorized")`, with no network call.
3. Timeout: 15 s via `AbortController`. A timeout or a `TypeError` network failure → `ApiError("network")`.
4. Response classification (`classifyResponse`, pure, unit-tested):
   - `response.redirected` to a host other than the API host, a 401 or 403 whose `content-type` isn't JSON, or HTML carrying the Vercel SSO marker → `ApiError("staging_protected")`;
   - other non-JSON → `ApiError("unavailable")`;
   - a 2xx with JSON → the data;
   - a JSON error envelope → `ApiError(code, message, details, status)`, with `code` from `API_ERROR_CODES` (an unknown code becomes `internal_error`);
   - a 5xx without an envelope → `"unavailable"`.
5. **401 `unauthorized` on an `auth` call:** call `supabase.auth.refreshSession()` once. On success, retry once with the new token. On a definitive refusal, supabase-js clears the session and `SIGNED_OUT` routes to Welcome. On a temporary refusal, throw `"unavailable"` and keep the session. Never more than one retry.
6. **426** sets the `upgradeRequiredSeen` flag (gate rule 3). **403 `account_suspended`** marks `me` suspended. **429** surfaces the server message. A `Retry-After` header is honored by the query layer (no automatic retry before it).
7. Nothing is logged except the method, the path, the status, and the error code. Never a header, a body, or a token.

The client types come only from `@overload/shared/contracts/*`. The **query layer** is TanStack Query v5:
- keys `["app-config"]` and `["me"]`;
- `focusManager` wired to `AppState`, and `onlineManager` to `expo-network`;
- `retry` limited to 2 for `network` and `unavailable`, and 0 otherwise;
- `staleTime` 60 s for app-config and 30 s for `me`;
- the cache cleared on sign-out.

A later slice adds its endpoints to the same client.

## 7. Environment isolation and staging access

**Allowlist** (`packages/shared/src/mobile/environment.ts`, pure):

```ts
export const MOBILE_APP_ENVIRONMENTS = ["staging"] as const;
export const STAGING_API_ORIGIN =
  "https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app";
export const STAGING_SUPABASE_REF = "vdxrmfadikwzodjljbdi";
export const PRODUCTION_MARKERS = ["ycxvdiklpefyhdclxyau", "overloadtraining.app"];
export function checkMobileEnvironment(env): { ok: true; config } | { ok: false; problems: string[] };
```

Rules:
- the environment is `staging`;
- the API origin is `STAGING_API_ORIGIN`, or, in development only (Metro, `__DEV__`), an `http://localhost`, `127.0.0.1`, or private-LAN (`10.*`, `192.168.*`) origin for a local `next start` against `overload-dev`;
- the Supabase URL is exactly `https://vdxrmfadikwzodjljbdi.supabase.co`;
- the anon key is non-empty;
- no value contains a production marker.

Problems name the variable, never its value.

**Enforced three times:**
1. **`apps/mobile/app.config.ts`** calls it and throws, so `expo start`, `expo prebuild`, `eas build`, and `eas update` all refuse a bad environment before anything is bundled. It also throws when `EAS_BUILD_PROFILE` is anything but `development` or `development-simulator`, or when the update channel is anything but `staging`.
2. **At runtime,** the root layout calls it with the embedded `EXPO_PUBLIC_*` values, and a failure is the `misconfigured` gate (no network call is made).
3. **`apps/mobile/tests/environment.test.ts`** reads `eas.json` and asserts:
   - exactly the two profiles exist;
   - the `staging` channel is the only channel;
   - no `production` key exists anywhere;
   - no committed file under `apps/mobile` contains a production marker.

**Values.**
- The API origin and environment are committed in `eas.json` `env`, since they are public.
- The Supabase URL and anon key for EAS builds and updates come from EAS environment variables (the `development` environment, plaintext visibility, because both are public by design: the anon key ships to every browser and RLS is deny-all).
- For local `expo start`, they come from a gitignored `apps/mobile/.env.local`.
- Nothing secret is in any of these.

**Staging access (OQ3).** The project's Deployment Protection is `ssoProtection: all_except_custom_domains`, and an automation-bypass secret already exists for Stripe test webhooks.
- 21d keeps protection on and uses a **separate** "Protection Bypass for Automation" secret, noted "Mobile development builds", so it can be revoked without touching Stripe. Creating it is an owner action (runbook §2).
- The secret is never committed, never placed in an environment variable, never in `eas.json`, never in a build, and never in an update.
- The owner enters it once per device on gate G6 (paste) or in Diagnostics. It is stored with `expo-secure-store` (`keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it is excluded from backups and other devices) and attached only to requests whose origin equals `STAGING_API_ORIGIN`. Supabase Auth and Cloudflare requests never carry it.
- The G6 gate and the key code are behind `MOBILE_APP_ENVIRONMENTS` containing only `staging`. When 21l adds `production`, the staging-access module is excluded for it (21l's spec must keep `tests/staging-access.test.ts` green, and that test asserts the module refuses to attach for any non-staging environment).

## 8. Native design system (OQ2)

- **Theme:** `apps/mobile/src/ui/theme.ts` builds `{ colors, radius, font, controlHeight, spacing }` from `@overload/shared/design/tokens`, plus a 4-point `spacing` scale, the one native-only addition, defined once. `useTheme()` returns the light or dark set.
- **Appearance resolution:** `resolveScheme(preference, system)` maps `system` to the device `useColorScheme()`. `light` and `dark` override. Signed out uses `system`.
- **Applied everywhere:** `Appearance.setColorScheme` is applied so native surfaces (the tab bar, alerts, keyboards, the status bar) follow, and `expo-system-ui` sets the root background so no white flash shows behind transitions.
- **First-paint mirror:** the last applied preference is stored in SecureStore under `overload.appearance`. It is a value, not a secret, but SecureStore avoids adding AsyncStorage for one key. It is read before first render and never authoritative (design §3).
- **Fonts:** Inter 400, 500, and 600 from `@expo-google-fonts/inter` (OFL), bundled as app assets and loaded with `useFonts` before the splash hides (no network: the files ship in the build and in every update). The font family names are `Inter_400Regular`, `Inter_500Medium`, and `Inter_600SemiBold`. A `Text` primitive maps `weight` to family, so no screen passes `fontWeight` with Inter, which iOS would synthesize.
- **Icons:** SF Symbols through `expo-symbols`. They are what the native tab bar uses, and they need no SVG runtime.
- **Primitives (design §10):** `Text`, `Button`, `TextField`, `FormScreen`, `Banner`, `GroupedList`, `ListRow`, `StateView`, `GateScreen`, `BotChallenge`, and `EnvironmentBadge`. No other kit and no styling library. Plain `StyleSheet` with theme values. Web Tailwind and shadcn are untouched.
- **Parity test:** `apps/mobile/tests/theme.test.ts` proves every color in the native theme is the shared token, so no native hex literal exists outside `theme.ts`. A guard scans `src/**` for `#[0-9a-f]{3,8}`, and only `theme.ts` may use one (and only for the transparent overlay token).

## 9. Navigation (OQ1, OQ10)

Expo Router 58. Typed routes are off: Expo’s generator runs from the root CLI and cannot resolve the workspace-nested `expo-router`.

```text
apps/mobile/src/app/
  _layout.tsx          Providers (Query, Theme, SafeArea, Auth), fonts, splash, the gate switch
  (auth)/_layout.tsx   native Stack (small titles, system back)
  (auth)/index.tsx     S1 Welcome
  (auth)/sign-in.tsx   S2
  (auth)/sign-up.tsx   S3 (+ S4 BotChallenge)
  (auth)/reset-password.tsx  S5
  (tabs)/_layout.tsx   NativeTabs (expo-router/native-tabs): today, history, plan, goals, more
  (tabs)/today/index.tsx  …/history/index.tsx …/plan/index.tsx …/goals/index.tsx   (stacks with large titles)
  (tabs)/more/_layout.tsx, index.tsx (M1), appearance.tsx (M2), diagnostics.tsx (M3)
```

The gates (G1–G6) are components rendered by the root layout in place of the `<Stack>` (not routes), so no deep link reaches behind one. The root uses `Stack.Protected` guards (`guard={gate === "signed_in"}` for `(tabs)`, `guard={gate === "signed_out"}` for `(auth)`), so a signed-out user cannot be routed into tabs. Each tab is its own folder with a `_layout.tsx` stack, so 21e–21j add screens without touching the shell. The URL scheme is `overload-dev`. No deep link performs an action in this slice.

## 10. Accounts

### 10.1 Sign-in (S2)
`supabase.auth.signInWithPassword` against the dev Supabase project directly (the anon key cannot create accounts: public signup is off). Errors go through the shared `signInErrorMessage` (moved from the web, unchanged). After success, `me` loads. A 403 means suspended (G5), and the session is kept so G5 can offer sign-out. There is no app-level throttle, the same as the web. Supabase Auth applies its own rate limits.

### 10.2 Signup (S3) — `POST /api/mobile/v1/accounts`
- **Pipeline:** `publicVersionedMobileRoute` (new) runs `connection()`, then the version gate (426 below minimum, 400 without the header), then the handler, then JSON or the envelope. There is no token. The registry marks it `public`. The static guard's public list grows by exactly this route and `password-reset`. **No per-account rate limit** (there is no account). The throttle inside `signUp` applies.
- **Body:** `SignUpRequestDto = { firstName, lastName, username, email, password, confirmPassword, timeZone, challengeToken }`, parsed as JSON with a 16 KB body cap. Anything that isn't JSON is a 400 `validation_error`.
- **Handler:** calls the **existing** `signUp(raw, deps)` with:
  - `throttleKey` = the same request fingerprint as the web (`x-forwarded-for` first hop, then `x-real-ip`, then `ua|accept-language`), extracted to `src/lib/accounts/request-fingerprint.ts` and used by both web actions unchanged;
  - `inviteCode: null` (public mode needs none; the legacy invite mode reads as closed to the app, 21c RD-19);
  - `signIn` and `signOut` deps bound to a **cookie-less anon Supabase client** created per request (`createStatelessAuthClient()` in `src/lib/supabase/stateless.ts`, `persistSession: false`, `autoRefreshToken: false`). Every other dep is the default, so the throttle, the Turnstile `verifyChallenge`, the hourly cap, validation, reserved usernames, the disposable-email blocklist, username uniqueness, `createConfirmedUser`, the trial dedupe, `establishProfile`, and compensation are byte-for-byte the web's path.
- **The signed-in session** from that sign-in is returned to the app, which calls `supabase.auth.setSession`. So the account is signed in exactly once and no orphan session is left. `SignUpOutcome` gains nothing. The handler reads the session the `signIn` dep captured.
- **Outcome mapping** (existing codes only, CLAUDE.md):

| `SignUpOutcome` | Status | Code | Message / details |
| --- | --- | --- | --- |
| `created` | 201 | — | `{ session: { accessToken, refreshToken, expiresAt, tokenType: "bearer" } }` |
| `closed` | 400 | `invalid_state_transition` | "Signup isn't open right now." |
| `invite_invalid` | 400 | `invalid_state_transition` | the same (the app has no invite field) |
| `rate_limited` | 429 | `rate_limited` | "Too many attempts. Wait a minute and try again." |
| `paused` | 429 | `rate_limited` | `SIGNUPS_PAUSED` |
| `challenge_failed` | 400 | `validation_error` | "Couldn't verify you're human. Try again." `details.challengeToken` |
| `invalid` | 400 | `validation_error` | "Check the highlighted fields." `details` = field errors |
| `email_taken` | 409 | `conflict` | "An account with this email already exists." `details.email` |
| `unexpected` | 500 | `internal_error` | "Couldn't create your account. Nothing was saved. Try again." |

`email_taken` is the web's existing disclosure, kept as is. The signup throttle bounds it.

### 10.3 Bot challenge (OQ5)
- **app-config** gains `botChallenge: { provider: "turnstile"; siteKey: string; origin: string } | null`. It is decided by the same `isTurnstileBypassEnabled()` the web pages use: null exactly when the web hides its widget. `siteKey` is `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, already public. `origin` is the canonical web origin (`NEXT_PUBLIC_APP_URL`), so the widget's hostname is one Cloudflare already allows for the web.
- **This additive field** is backward compatible, and 21c's "no URL in app-config" (pitch rabbit hole I) is amended for this one value. It is the public web origin the user already visits, not an internal URL, and it is recorded as an upstream note (owner notes).
- **`BotChallenge`** renders `react-native-webview` with `source={{ html, baseUrl: origin }}`. The HTML loads `https://challenges.cloudflare.com/turnstile/v0/api.js` and renders the widget with the theme and `appearance: "always"`. Its callbacks post `{ type: "token" | "expired" | "error", token? }` through `window.ReactNativeWebView.postMessage`. `onShouldStartLoadWithRequest` allows only `about:blank`, the `baseUrl`, and `https://challenges.cloudflare.com/*`, and opens nothing else.
- **The secret stays server-side.** `verifyChallenge` checks the token exactly as for the web. With no token or a forged one, the server refuses (challenge failed), and the app cannot skip it. When the server's bypass is on (staging today, where `TURNSTILE_DISABLED=true` on Preview), app-config sends null and the server ignores the token, the same as the web.
- **App Attest** is evaluated before the public App Store release (21l), per the roadmap.

### 10.4 Abuse limits (OQ6)
- **Kept:** the per-fingerprint throttle (10 attempts a minute, shared bucket with the web), the global hourly cap, Turnstile, reserved usernames, the disposable-email blocklist, and the trial dedupe flag.
- **Carrier NAT:** the throttle allows 10 attempts a minute per IP. At beta scale, a carrier IP producing 10 signups a minute is abuse, not a crowd. The hourly cap bounds the total.
- **No per-device identifiers:** a persistent device id or fingerprint is privacy-sensitive and is the owner's call (pitch §G).
- **No new per-email limit:** Supabase already refuses a second account per email, and recovery already throttles per fingerprint.
- **Recorded for 21l:** App Attest, and whether a per-email signup limit is worth adding once real abuse is observed.

### 10.5 Reset request (S5) — `POST /api/mobile/v1/password-reset`
- `publicVersionedMobileRoute`. Body `{ email, challengeToken }`, with a 4 KB cap.
- Calls the **existing** `requestPasswordReset(input, { throttleKey: fingerprint, auth: () => statelessClient.auth })`.
- `ok` → 200 `{ sent: true }`. A malformed email or a failed challenge → 400 `validation_error` with the module's message. Everything else (unknown email, throttled, Auth down) is the identical 200 (D7).
- No `redirectTo` is passed, the same as the web, so the email links to the Site URL's `/auth/confirm` → `/reset-password` on the web. The app never handles the link.

### 10.6 Appearance — `PUT /api/mobile/v1/me/appearance`
- `mobileRoute` (token, account rate limit). Body `{ appearance }` → `updateAppearance(account, body.appearance)` → 200 `{ appearance }`.
- It is an absolute write, so it is retry-safe with no idempotency key (21c rule). Invalid → 400 `validation_error` "Choose Light, Dark, or System."

### 10.7 Sign-out
`supabase.auth.signOut({ scope: "local" })`. It revokes this device's refresh token, matching the web's local sign-out. The session is removed from the Keychain, and the query cache is cleared. A network failure during sign-out still clears the local session; supabase-js removes the local session regardless.

### 10.8 Suspended and deleted accounts
- **Suspended:** the API refuses with 403 (21c). G5 offers the web (export and delete, the data-rights exception) and sign-out. The app cannot reach any data.
- **Deleted:** `getUser` fails, so the API answers 401, and the refresh is refused (the identity is gone), so the app is signed out.
- **Password reset elsewhere:** recovery signs out every session, so the next refresh is refused and the app is signed out.

## 11. Secure storage (OQ4)

`SecureStoreAdapter` (`apps/mobile/src/auth/secure-storage.ts`) implements supabase-js `SupportedStorage` over `expo-secure-store`:
- **Accessibility:** `keychainAccessible: AFTER_FIRST_UNLOCK`, so a background refresh works after the first unlock.
- **Chunking:** the Supabase session JSON can exceed SecureStore's recommended 2 KB, so values are split into 1,800-character chunks under `${key}.${i}`, with a `${key}.n` count. Writes go chunks first and count last. Reads with a missing chunk return null, which reads as signed out, never corrupt JSON. `removeItem` deletes all chunks.
- **Keys** are prefixed `overload.` and must match `[A-Za-z0-9._-]` (a SecureStore constraint), so Supabase's default key is overridden with `storageKey: "overload.auth"`.
- **Nothing else stores a token:** no AsyncStorage dependency, no MMKV, no file. A guard test fails if `@react-native-async-storage/async-storage` or `react-native-mmkv` is a dependency.

## 12. Hermes date and time-zone spike (OQ7)

`apps/mobile/src/diagnostics/hermes-checks.ts` exports `HERMES_CHECKS: { id, run(): { ok, actual, expected } }[]`, pure and shared-only. The checks:
1. `isValidTimeZone` on `America/Chicago`, `Pacific/Auckland`, and `Asia/Kolkata` is true, and on `Mars/Phobos` and `""` is false.
2. `isoDateInZone` for fixed instants, with golden values:
   - Chicago around spring-forward (`2026-03-08T07:59:59Z` → `2026-03-08`, `2026-03-08T05:59:59Z` → `2026-03-07`);
   - Chicago around fall-back (`2026-11-01T05:30:00Z` → `2026-11-01`, `2026-11-01T04:59:59Z` → `2026-10-31`);
   - Chicago late evening (`2026-11-15T05:30:00Z` → `2026-11-14`);
   - Auckland across the date line (`2026-11-14T11:30:00Z` → `2026-11-15`);
   - Kolkata half-hour offset (`2026-11-14T18:29:59Z` → `2026-11-14`, `18:30:00Z` → `2026-11-15`);
   - UTC.
3. `todayIso(zone, instant)` equals `isoDateInZone`.
4. `formatPlanDate("2026-11-02")` is `"Mon, Nov 2"`, and `formatMonthDay` matches the web.
5. `addDays` across the DST weekend keeps UTC-midnight arithmetic.
6. The device's own zone, from `Intl.DateTimeFormat().resolvedOptions().timeZone`, passes `isValidTimeZone`, and is the zone the signup sends.

**Proof** comes from the same goldens under Node in Jest (`tests/hermes-checks.test.ts`, which runs `HERMES_CHECKS`) and under Hermes on the simulator (the run executes Diagnostics in the iOS Simulator and records the result in the owner notes), and on the physical iPhone at Checkpoint B.

**If Hermes fails a check,** the fix is the minimum: for example, replacing `formatToParts` with a `format`-and-parse fallback inside `isoDateInZone`, with identical output under Node, so the web's behavior is unchanged and proven by the existing calendar tests. The scheduling model is not touched.

**T1 Today** shows `todayIso(me.profile.timeZone)` formatted as "Saturday, November 14", the only Today behavior in this slice.

## 13. Workspace, build, and tooling

- **Dependencies** (`apps/mobile/package.json`, pinned to the SDK 58 bundle): `expo ~58.0.25`, `react 19.3.0`, `react-native 0.88.1`, `expo-router ~58.0.31`, `react-native-screens ~4.30.1`, `react-native-safe-area-context ~5.11.1`, `expo-secure-store`, `expo-constants`, `expo-updates`, `expo-dev-client`, `expo-status-bar`, `expo-system-ui`, `expo-font`, `expo-splash-screen`, `expo-linking`, `expo-web-browser`, `expo-haptics`, `expo-network`, `expo-symbols`, `expo-application`, `expo-localization`, `react-native-webview 14.0.1`, `@supabase/supabase-js ^2.117.2` (the web's range, deduped), `@tanstack/react-query ^5`, `react-native-url-polyfill ^4`, `@expo-google-fonts/inter`, and `@overload/shared`. Dev: `jest-expo ~58.0.14`, `jest ^30.5.2` (the web's), `@testing-library/react-native ^14`, `eslint-config-expo ~58.0.4`, `@types/react ~19.3.0`, `typescript ^5` (5.9.3, the 21a decision; the TypeScript 6 template default is not needed).
- **React lockstep** holds: the install spike on 2026-11-14 produced one `react@19.3.0` and one `react-dom@19.3.0` for the whole workspace, and `scripts/workspace-boundaries.mjs` passes.
- **Boundary additions:**
  - **B8:** `apps/mobile` declares no `@react-native-async-storage/async-storage` or `react-native-mmkv` (tokens only in the Keychain).
  - **B9:** `apps/mobile/src` imports `@supabase/supabase-js` only in `src/auth/supabase.ts`, and that module exports only the `auth` client surface, so no file can call `.from()`, `.rpc()`, `.storage`, `.channel()`, or `.functions` on it. A test also scans `src/**` for those member calls.
- **Metro:** `expo/metro-config` defaults (workspace-aware), with no custom resolver (21a decision 4). The verification includes `npx expo export --platform ios` (a Hermes bytecode bundle) to prove the shared package bundles.
- **Babel:** `babel-preset-expo` (the default `babel.config.js` is not needed in SDK 58; if absent, Expo uses its preset).
- **TypeScript:** `apps/mobile/tsconfig.json` extends `expo/tsconfig.base` with `strict`, and `paths` is not needed (`@overload/shared` resolves through workspace `exports`, with `moduleResolution: "bundler"`).
- **ESLint:** `eslint-config-expo/flat` plus the workspace's restricted imports (no `@/` web alias, no server modules).
- **Jest:** the `jest-expo/ios` preset. Its tests live in `apps/mobile/tests`. The root `npm test` runs it through the workspace `test` script.
- **Format:** Prettier from the root, with `apps/mobile/ios`, `apps/mobile/android`, `.expo`, and `dist` ignored.
- **Config loading:** `app.config.ts` imports the shared environment module and tokens by their explicit `.ts` paths, which Node (>= 22.18) type-strips natively. `eas.json` pins the build Node to 22.23.5, and `tsconfig` sets `allowImportingTsExtensions`. The production markers appear in the bundle only as the guard's own refusal list.
- **Native folders are generated:** `apps/mobile/ios` is produced by `expo prebuild` (Continuous Native Generation) and gitignored. Config plugins hold every native setting.
- **App identity (development):**
  - name "Overload Dev", slug `overload`, owner `wtrhodes` (the authenticated Expo account), scheme `overload-dev`;
  - bundle identifier `app.overloadtraining.dev`, iOS deployment target from SDK 58's default, `supportsTablet: false`;
  - version `0.1.0`, `runtimeVersion: { policy: "fingerprint" }`;
  - `updates.url` `https://u.expo.dev/<projectId>`, with `checkAutomatically: "ON_LOAD"`.
- **The Production bundle identifier** is decided in 21l.
- **EAS (`eas.json`):** `cli.appVersionSource: "local"`; profiles:
  - `development`: `developmentClient`, `distribution: internal`, `channel: staging`, `environment: development`;
  - `development-simulator`: extends development, with `ios.simulator: true`.
  - There is no `preview`, `production`, or `submit` block.
- **OTA versus rebuild (OQ11):** the fingerprint runtime version changes whenever native code or config changes (a dependency with native code, a config plugin, `app.config.ts` native fields, or the Expo SDK). An update only reaches builds with the same fingerprint. The runbook's rule: a JavaScript, style, or asset change goes out with `npm run mobile:update:staging` from the root (RD-28); a native change needs `eas build --profile development`, and the old build simply won't see the new update.
- **Scripts:** `start` (`expo start --dev-client`), `ios` (`expo run:ios`), `bundle:ios` (`expo export --platform ios --output-dir dist`), `update:staging` (`eas update --channel staging --environment development`), `lint`, `typecheck`, `test`, and `doctor` (`expo-doctor`).

## 14. Data model

No schema change, no migration, no new table. The new endpoints write through existing modules (`signUp` → Profile, Entitlement, ReleaseSeen, and TourProgress exactly as the web; `updateAppearance` → `Profile.appearance`).

## 15. Authorization and access control

- **Signup and reset are public by design** (as on the web), version-gated, and take no account input beyond their bodies.
- **`PUT /me/appearance`** takes the account from the verified token (21c pipeline) and writes only that account's profile (`updateMany where userId`).
- **No client-supplied ids:** no route accepts an account id or a primary key.
- **The isolation suite** gains cases:
  - account B's token on `PUT /me/appearance` changes only B's row, and A's stays;
  - a signup through the API creates one new account with exactly the web signup's rows, and touches no other account's rows;
  - a reset request for A's email returns the identical body to one for an unknown email;
  - no new endpoint accepts or echoes another account's identifier.

## 16. Validation rules

The server is authoritative. Signup uses the shared parsers through `signUp` (names, username, email, password presence and match, `weakPasswordMessage` from Supabase's policy). Reset uses `checkEmail`. Appearance uses `isAppearance`. The JSON body caps are 16 KB (signup) and 4 KB (reset and appearance). Unknown fields are ignored, and wrong types are a `validation_error`. The app mirrors only presence and format for instant feedback, from the same shared parsers.

## 17. Testing strategy

**Unit, web (`npm test`):**
- `publicVersionedMobileRoute` refuses a missing or old version header (400 or 426), and a malformed body is a 400;
- the signup handler maps every `SignUpOutcome` (table §10.2) and passes the fingerprint, `inviteCode: null`, and the stateless deps;
- the reset handler gives an identical body for success, throttled, and unknown;
- the appearance handler;
- app-config `botChallenge` is null under bypass and present otherwise, and never contains the secret;
- the registry and guards cover the new routes;
- the fingerprint extraction is unchanged for the web actions;
- the moved sign-in messages are byte-identical.

**Integration (`npm run test:integration`):** the isolation cases in §15 and the signup rows (one profile, a trial entitlement, release notes caught up, tour due), with Supabase admin, Auth, and Turnstile faked at their seams.

**Unit, mobile (`npm test -w @overload/mobile`, jest-expo):**
- the gate machine (every rule and its order);
- `classifyResponse` (Vercel HTML 401, a redirect, an envelope, a 5xx, a timeout);
- the API client (headers, bypass only to the staging origin, one refresh-and-retry, no retry on a definitive refusal, 426 flag);
- `SecureStoreAdapter` (chunking, a missing chunk reads as null, remove);
- the environment allowlist (staging accepted, a production ref, host, or channel refused, problems name variables only);
- the `eas.json` and `app.config` guards;
- the staging-access module (refuses non-staging, never attaches to Supabase or Cloudflare);
- the theme token parity and hex guard;
- the Hermes checks under Node (goldens);
- the BotChallenge message parser and navigation allowlist;
- render tests of S2, S3, S5, G2–G6, M1, and M2 (light and dark, error states);
- boundary B8 and B9.

**Build checks:** `expo-doctor`, `expo config --type public` (no secret in the public config), `expo export --platform ios` (Metro and Hermes bytecode), a local simulator build (`expo run:ios`) when CocoaPods is available, and EAS builds.

**Unverified by design** (owner checkpoints, runbook): the physical-device install, Keychain persistence across relaunch and reboot on a device, background and resume on a device, the staging OTA receipt on a device, and the Turnstile widget in a real WebView against a non-test key.

## 18. Acceptance criteria

1. `npm ci`, `lint`, `typecheck`, `format:check`, `npm test` (web, shared, mobile, boundaries), `npm run test:integration`, `npm run build`, and `verify:client-bundle` are all green.
2. The web's visible behavior is unchanged (the login messages are identical, and the signup and forgot actions use the same fingerprint).
3. `expo-doctor` passes, and `expo export --platform ios` bundles the shared package.
4. The app's config, build, and runtime refuse a Production API, Supabase ref, channel, or profile.
5. Sign-in against staging, session restore after relaunch, a single refresh-and-retry on 401, and sign-out clearing the Keychain.
6. A temporary failure (network, 5xx, Vercel page, Auth 503) never clears the session.
7. Signup through `POST /accounts` runs the web's exact `signUp` path, returns a session, and is refused without a valid challenge when the server requires one.
8. A reset request through `POST /password-reset` gives the identical answer for every address.
9. Every request carries `X-Overload-App-Version`, and 426 or `minimumAppVersion` shows G2.
10. Maintenance shows G3, suspension shows G5, and a staging protection page shows G6 (development builds).
11. The tab shell with honest placeholders, More, Appearance (saves to the account), and Diagnostics.
12. The Hermes checks pass under Node and in the iOS Simulator.
13. Owner checkpoints A (simulator), B (iPhone), and C (staging OTA) are approved. Until then the feature PR stays open (pitch DoD 44).

## 19. Explicit non-goals

No logging, Today plan list, history, plan, goals, library, or gyms screens. No tour, What's New, trial dialog, profile editing, export, or deletion in the app. No billing, store, or TestFlight. No Production channel, profile, or build. No App Attest. No device identifiers. No offline cache. No analytics. No Android.

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 (OQ1) | Expo Router 58: a root stack with `Stack.Protected` guards; gates are components, not routes; `(auth)` native stack; `(tabs)` uses Expo Router **native tabs** (UIKit tab bar) with five tabs (Today, History, Plan, Goals, More), each a stack folder. | The system tab bar and native stacks are the iOS convention; file-based folders let 21e–21j add screens without touching the shell; gates as components can't be deep-linked past. | `overload-mobile-ui` mapping; audit §6 native patterns; pitch §B |
| RD-2 (OQ2) | The native theme is a pure mapping of `@overload/shared/design/tokens`, adding only a 4-point spacing scale; `StyleSheet`, no styling library; Inter embedded via `@expo-google-fonts/inter`; SF Symbols via `expo-symbols`; a parity test and a hex-literal guard keep one visual authority. | Tokens are the single source (21b); a styling library would be a second system; SF Symbols are what the native tab bar needs. Supersedes the audit's suggestion of `lucide-react-native`, which would add an SVG runtime for no gain on iOS. | 21b tokens; CLAUDE.md "no second library"; audit §6 |
| RD-3 (OQ3) | Staging stays protected. A dedicated Vercel "Protection Bypass for Automation" secret for mobile development is entered once per device and stored only in the Keychain (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). It is sent only to the staging API origin and never committed, in env, in a build, or in an update. Creating the secret is an **owner checkpoint**. Until it exists, the run verifies against a local `next start` on overload-dev. | Satisfies "no long-lived bypass credential in any distributable build": no artifact contains it. A per-device secret survives OTA updates and rebuilds without redistribution, and is revocable without touching the Stripe webhook secret. A custom unprotected staging domain would open staging to the internet. | Pitch §J and rabbit hole F; Vercel project settings read 2026-11-14 |
| RD-4 (OQ4) | supabase-js with a chunked `expo-secure-store` adapter (`AFTER_FIRST_UNLOCK`), `autoRefreshToken` started and stopped on `AppState`, and `detectSessionInUrl: false`. No AsyncStorage dependency at all (B8). | The audit's recommendation; Keychain is the iOS secure store; chunking avoids the 2 KB limit; no second store means no token can leak into one. | Audit §3 "What mobile needs" |
| RD-5 | The session is cleared only on a definitive Auth refusal or a user sign-out. Network, timeout, 5xx, Auth 408/429/503, non-JSON, and Vercel pages are temporary: the session is kept and a retryable state is shown. The client does at most one refresh-and-retry per 401. | Pitch rabbit hole C; 21c RD-20 already maps Auth outages to 503. | Pitch §F |
| RD-6 (OQ5) | Turnstile in a `react-native-webview` loading inline HTML with `baseUrl` = the canonical web origin. The site key and origin come from a new `app-config.botChallenge` field, null exactly when the web hides its widget (the server bypass). The server verifies with the existing `verifyChallenge`. | The roadmap's recommended beta default; one decision point (`isTurnstileBypassEnabled`) for web and mobile; the token is server-verified, so the app cannot skip it; no secret in the app. | Roadmap 21d; CLAUDE.md signup defenses |
| RD-7 | Native signup is a new public, version-gated endpoint, `POST /api/mobile/v1/accounts`, that calls the existing `signUp` with stateless sign-in deps and returns the new session. Outcomes use existing error codes (table §10.2). | One signup module and one set of defenses; returning the session avoids a second sign-in and any orphaned session. No new error code, per CLAUDE.md. | CLAUDE.md access model; pitch §G |
| RD-8 (OQ6) | Keep the shared per-fingerprint throttle, hourly cap, Turnstile, reserved names, disposable domains, and trial dedupe. No device identifiers and no per-email limit. App Attest is evaluated in 21l. | Evaluated as the pitch asks. A device id is the owner's privacy call. Beta-scale numbers make carrier NAT a non-issue at 10 a minute. | Pitch §G, OQ6; roadmap risks |
| RD-9 | The reset request is `POST /api/mobile/v1/password-reset` over the existing `requestPasswordReset`, with the same non-enumeration and no `redirectTo`; completion stays on the web. | Reuses the privacy core unchanged. | Roadmap "web-only for now"; pitch §H |
| RD-10 (OQ8) | Appearance: `me.appearance` is authoritative once signed in; `system` follows the device; More → Appearance writes through `PUT /me/appearance` (existing `updateAppearance`, an absolute write); a device-local first-paint mirror is never authoritative. | The same semantics as the web (Pitch 10 R6). The pitch's handoff includes switching appearance. The write is absolute, so it is retry-safe without an idempotency key. | Pitch §D, §10; 21c retry-safety rule |
| RD-11 (OQ9) | Version and maintenance: G2 when `minimumAppVersion` > the app version or on any 426; G3 on `killSwitches.maintenance`; G4 for unreachable, distinct from both; development builds offer "Check for update" (OTA). No new config system. | Consumes 21c's contract as is. | 21c §8 |
| RD-12 (OQ10) | Functional: S1–S5, G1–G6, T1's date line, M1–M3. Placeholders: T1–T4 bodies and the Exercises and Gyms rows (open the web). No new feature endpoints. | Pitch rabbit hole H. The date line exercises the shared calendar under Hermes honestly. | Pitch §B, OQ10 |
| RD-13 (OQ11) | EAS: the `development` (device) and `development-simulator` profiles, the `staging` channel only, a fingerprint runtime version, and owner `wtrhodes`. No Production profile or channel. Bundle id `app.overloadtraining.dev`. Apple signing (EAS-managed credentials and device registration) is an **owner checkpoint**. | The fingerprint policy makes "OTA versus rebuild" mechanical. Separate dev identifiers keep a future Production app installable alongside. Apple's interactive login can't be automated. | Pitch §N, rabbit hole J; CLAUDE.md review loop |
| RD-14 (OQ12) | Device verification is recorded only from the owner's explicit confirmation per checklist item (runbook §5), in the feature PR. Simulator checks the run executes itself are labelled "run in the iOS Simulator by the pipeline". Nothing is marked passed from a build log. | Pitch rabbit hole K; verification honesty. | CLAUDE.md verification honesty |
| RD-15 | Environment allowlist, enforced in `app.config.ts`, at runtime, and in a test; the only environment in 21d is `staging`; local `next start` origins are allowed only in `__DEV__`. | Three independent fences against Production contamination (pitch rabbit hole L). | CLAUDE.md "Development builds connect to staging" |
| RD-16 | Data fetching is TanStack Query v5 (`focusManager` on `AppState`, `onlineManager` on `expo-network`). | Retry, focus refetch, and cache-clearing on sign-out without a hand-rolled cache. It is the convention later slices follow. It is flagged as a new library in the owner notes. | Architecture "data-fetching library … decided in the slice specs" |
| RD-17 | `react-native-url-polyfill` is installed for supabase-js on React Native. | Supabase's React Native guidance. React Native's built-in `URL` is incomplete. | Supabase docs |
| RD-18 | TypeScript stays 5.9.3 across the workspace. | 21a decision 5; the Expo template's TypeScript 6 is not a peer requirement. | 21a spec §10 |
| RD-19 | `me.tour`, `me.whatsNew`, and `me.trialNotice` are fetched but not rendered. | Their native surfaces are 21j and 21k. Rendering a trial dialog now would anticipate those designs. | Roadmap 21j, 21k |
| RD-20 | The request fingerprint moves to `src/lib/accounts/request-fingerprint.ts`, shared by the web actions and the mobile routes, with its behavior unchanged. | One throttle-key rule for both clients. | CLAUDE.md signup defenses |
| RD-21 | The sign-in error messages move to `@overload/shared/accounts/auth-errors`, and the web re-exports them. | One copy of the copy, so the web and the app can't drift. | 21b principle |
| RD-22 | `billingCopy` (the plan labels) moves to `@overload/shared/billing/copy`, and the web re-exports it unchanged. The app's read-only plan row uses its `shortLabel`. | The app shows the server's plan state in the web's words without copying them. It is display only; access stays enforced from capabilities on the server. | 21b principle; pitch §4 plan placement |
| RD-23 | At config time, `app.config.ts` refuses only values that are present and wrong. An absent `EXPO_PUBLIC_*` value passes, because eas-cli evaluates the config once without `.env` files and before injecting the EAS environment. The app's launch check (the misconfigured gate) refuses a build without the values. | Found when publishing the first staging update. Every Production value is still refused at config time, at bundle time, and at launch. | Spec §7; live `eas update` run |
| RD-24 | The update-channel guard applies when `EAS_UPDATE_CHANNEL` is set (the `update:staging` script sets it). The guarantee is `eas.json`: every build listens to `staging` only, so an update on any other channel reaches no build. | Review finding #7: eas-cli may not set the variable itself. | Review audit |
| RD-25 | Diagnostics (M3) exists only in the environments `diagnosticsAvailable` allows: an allowlist holding `staging`, so 21l's `production` is excluded by default. The More row, a `Stack.Protected` guard on the route (a deep link lands on More), and the screen itself each check it. It is decided by the build's embedded environment, not `__DEV__`, so a staging update keeps it for Checkpoint C. It shows facts only: the access key as "Stored" or "Not stored", never a token, key, email, or password. | Simulator QA asked for a build gate, not a hidden row, because Diagnostics can remove the staging access key. | Design M3; RD-3; simulator QA |
| RD-26 | A failed appearance save returns the account's saved choice, and shows "Couldn't save" only when that differs from the lifter's latest tap. A superseded save that fails while the newest choice already equals the saved one loses nothing and shows no error. | Simulator QA on staging (no save endpoint before the merge): a slow failing Light save showed the error on the later Dark tap, which was already saved. | RD-10; review #2; simulator QA |
| RD-27 | The app has its own root `+not-found` route, which redirects to `/` (Welcome, or Today through the guarded `(auth)` group). Expo Router's built-in Unmatched page never shows. | Checkpoint C on the iPhone: the stale update showed Unmatched, and its Sitemap crashed (`window.location` is unset outside Metro, so `window.location.origin` throws in Expo Router's SystemInfo). The built-in page is a development aid. | Spec §5; physical-iPhone QA |
| RD-28 | Staging updates are published only by `npm run mobile:update:staging` (root): from a clean commit that is on GitHub, to channel `staging`, iOS, environment `development`, with the commit prefixed to the message and stamped into the bundle (`EXPO_PUBLIC_SOURCE_COMMIT`), only when a finished staging development build has the same runtime fingerprint, and only when the EAS `development` environment holds valid staging values (checked with `eas env:exec`, names only). Only `--message` may be passed, so the update is always a fresh export of HEAD (final review: `--skip-bundler` could publish a stale `dist`). The script lives at the root because `apps/mobile/package.json` scripts are part of the fingerprint. The old workspace `update:staging` script stays unchanged until the next native rebuild, so the installed build keeps receiving updates. | The update on `staging` came from b2d2a9e with uncommitted changes and predated the navigation fixes, and nothing showed it. | RD-24; physical-iPhone QA |
| RD-29 | Diagnostics → Updates names the running bundle: Metro, EAS update, or embedded, plus the update group (8 characters), the commit, the publish time in UTC, the channel, and the runtime. An update the dev launcher opened by URL has no channel ("Not set (opened by URL)"), because the launcher configures expo-updates from the URL. | The update id's first characters are a UUIDv7 timestamp and look alike across publishes, and a Metro launch read "Update ?". | Design M3; RD-25 |

## Open Questions

None blocking. The owner checkpoints (§17 "Unverified", runbook) are not open questions. They are the device review the pitch requires.

## 20. Future considerations

- **21e onward** add endpoints to the client and screens to the tab folders.
- **21j** renders What's New and the trial notice and moves appearance into a Settings screen.
- **21k** adds coach marks.
- **21l** adds the `production` environment and profile:
  - the Production bundle identifier and associated domains, so Keychain password autofill comes from the web domain;
  - a store link in G2;
  - App Attest evaluation;
  - removing the staging-access module from production builds, which `tests/staging-access.test.ts` already asserts.
