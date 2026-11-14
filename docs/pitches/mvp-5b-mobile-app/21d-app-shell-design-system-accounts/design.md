# App Shell, Design System & Accounts — Design Document

**Pitch:** 21d — App Shell, Design System & Accounts (`pitch.md` in this folder)
**Milestone:** MVP 5B — Mobile App
**Version:** 1.0 (pipeline run of 2026-11-14)
**Client scope:** Native iOS app (`apps/mobile`), plus small additive mobile API endpoints in `apps/web`
**Plan placement:** Free. Plan state is displayed read-only, with no purchase path.
**Inputs:** `pitch.md`, `docs/planning/mobile-roadmap.md`, `docs/planning/mobile-audit.md` §3, §6, §8, the 21a–21c specs, `overload-mobile-ui`, `overload-cross-platform`, `CLAUDE.md`.

> **The native visual contract lives in §15 (Mobile design).** `overload-mobile-ui` defines no standalone preview file for a native screen; the pipeline's step 3 for a mobile slice is this section. The owner approves it on the device at Checkpoints A and B (runbook), not in a browser.

---

## 1. Vision

Opening Overload on an iPhone should feel like opening a well-made instrument: one quiet welcome, a sign-in that remembers you, and a shell that already has the shape of the finished app, with Today, History, Plan, Goals, and More. Nothing pretends to work before it does. Screens whose features arrive in later slices say so in one sentence and offer the web.

The real work in this slice is invisible. The session survives restarts and short outages. Every request carries the token and the app version. A required update, maintenance, a suspension, and a dead connection each have their own honest screen. The app reaches staging only, through a development-only door that never ships in a distributable build.

## 2. Design principles

### 1. Native first, Overload always
iOS navigation, keyboards, alerts, and the system tab bar; Overload's tokens, type, and quiet tone. When the two conflict, the platform wins on behavior and the brand wins on color and voice.

### 2. A session is kept until it is truly invalid
Only a definitive refusal (a refresh token the auth service rejects, or a sign-out) ends a session. A timeout, a 503, a Vercel error page, or an unreachable network keeps the session and shows a retryable state.

### 3. The server decides; the app displays
Plan state, capabilities, the version floor, maintenance, signup mode, and whether a bot challenge is required all come from the API. The app never computes an entitlement, a progression call, or a policy.

### 4. Every blocking condition gets its own screen
Restoring, update required, maintenance, unreachable, suspended, and staging access are distinct full-screen states with one clear action each. They never share a generic "Something went wrong".

### 5. Placeholders are honest
A tab whose feature belongs to 21e–21j shows an empty state that says it is coming and links to the web. No mock data and no disabled fake controls.

## 3. Visual language

All values come from `@overload/shared/design/tokens` (Pitch 21b). The app adds no color, radius, or type value of its own. A native theme module maps the tokens to React Native styles.

### Color palette

| Role | Token | Light | Dark |
| --- | --- | --- | --- |
| Screen background | `background` | `#f7f7f8` | `#0b0b0c` |
| Grouped rows and cards | `card` | `#ffffff` | `#141416` |
| Primary text | `foreground` | `#0e0e10` | `#f2f2f3` |
| Secondary text | `mutedForeground` | `#5f5f68` | `#a1a1a8` |
| Primary action and tint | `primary` / `primaryForeground` | `#0159fd` / `#ffffff` | `#1a66ff` / `#ffffff` |
| Secondary button fill | `secondary` | `#ececed` | `#1c1c1f` |
| Separators and input borders | `border` / `input` | `#e4e4e8` | `#26262a` |
| Focus ring (input focused) | `ring` | `#0159fd` | `#2f7bff` |
| Errors | `destructive` | `#b42318` | `#e5484d` |

### State colors
`progress` and `deload` are not used in this slice. Error text and destructive rows use `destructive`. Info banners (maintenance notice, environment badge) use `muted` with `mutedForeground` text.

### Typography, spacing, radius, elevation
- **Font:** Inter, weights 400, 500, and 600 only (`font.weights`), embedded in the build. Sizes come from `font.sizes`: large titles use `2xl` 24/32 semibold, screen titles `xl`, body `base` 16/24, secondary `sm` 14/20, captions `xs` 12/16. Every number uses tabular figures (`fontVariant: ["tabular-nums"]`).
- **Dynamic Type:** text scales with the system setting (React Native's default `allowFontScaling`). Layouts wrap and never clip. Inputs and buttons grow in height rather than truncate.
- **Spacing:** a 4-point grid. Screen gutters 16, section gaps 24, row padding 12 vertical by 16 horizontal.
- **Radius:** `radius.lg` (8) for buttons, inputs, and cards. `radius.xl` (12) for the grouped-list container.
- **Control heights:** buttons and inputs use `controlHeight.lg` (44), never less than `touchMin` (44). Primary buttons on account screens are 48 (44 plus 4 for comfortable thumb reach), as on the web's `h-11`/`h-12` auth buttons.
- **Elevation:** none. Separation is by `border` hairlines and the background-to-card contrast.

### Appearance
`Profile.appearance` (system, light, or dark) is the account's preference, and `system` follows the device. The app applies the stored value from `me` once signed in, follows the device while signed out, and remembers the last applied value on the device so a cold start paints the right theme before `me` arrives (the same "first-paint mirror" rule as the web's `localStorage` key, which is never authoritative). Changing it in More → Appearance writes the account preference through the API, so the web follows on its next load.

## 4. Information architecture

```text
Root (one Expo Router tree)
├── Gate layer (decided on every launch and resume, in this order)
│   1. Launching / restoring session ............ G1
│   2. App config unreachable and no session .... G4 Unreachable
│   3. Version below minimum (app-config or 426)  G2 Update required
│   4. Maintenance (app-config) ................. G3 Maintenance
│   5. Staging protection blocked the request ... G6 Staging access (development builds only)
│   6. Signed out → (auth) stack
│   7. Signed in, me → 403 account_suspended .... G5 Suspended
│   8. Signed in, me unreachable ................ G4 Unreachable (session kept)
│   9. Signed in, me OK → (tabs)
│
├── (auth) stack — signed out
│   ├── Welcome ............................... S1
│   ├── Sign in ............................... S2
│   ├── Create account ........................ S3 (with the bot challenge, S4)
│   └── Reset password ........................ S5 (request + sent state)
│
└── (tabs) — signed in, the system tab bar
    ├── Today   (placeholder + account-local date) ... T1
    ├── History (placeholder) ........................ T2
    ├── Plan    (placeholder) ........................ T3
    ├── Goals   (placeholder) ........................ T4
    └── More    (stack)
        ├── More list ................................ M1
        ├── Appearance ............................... M2
        └── Diagnostics (development and staging builds only) M3
```

Exercises and Gyms are rows in More (M1) that open the web for now. 21h decides where they live natively. A fifth primary tab is reserved for More because iOS shows five tabs before "More" overflow.

## 5. Surfaces affected

| Surface | Change |
| --- | --- |
| `apps/mobile` | New: the Expo app (all screens below). |
| `packages/shared` | Additive: the signup and reset request bodies, the challenge config on `AppConfigDto`, the sign-in error messages (moved from the web, unchanged), the app-environment guard values. |
| `apps/web` mobile API | Additive: `POST /api/mobile/v1/accounts` (signup), `POST /api/mobile/v1/password-reset`, `PUT /api/mobile/v1/me/appearance`, and `botChallenge` on `GET /app-config`. |
| `apps/web` screens | None. The login page imports its messages from the shared module; its text is byte-identical. |

## 6. Screen specifications

Each native screen's layout is in §15. This section gives purpose, behavior, and states.

### Screen S1: Welcome
- **Purpose:** The signed-out landing. One sentence of what Overload is, and two ways in.
- **Trigger:** No stored session, or after sign-out.
- **Behavior:** "Sign in" pushes S2. "Create an account" pushes S3, and is replaced by the line "New accounts can't be created right now." when app-config says `signupMode: "closed"`. Non-production builds show an environment badge ("Staging") under the lockup.
- **States:** If app-config fails, the buttons still work. Sign-in does not need app-config. Signup then shows its own unreachable notice.

### Screen S2: Sign in
- **Fields:** Email (`emailAddress` keyboard, `textContentType="username"`, autocomplete `email`, no autocapitalize), Password (`secureTextEntry`, `textContentType="password"`). Return on email moves to password, and return on password submits.
- **Validation:** Both empty → "Enter your email and password." Auth refusal messages are the web's, from one shared source: "Wrong email or password." (an unknown email and a wrong password are the same answer), "Too many attempts. Wait a minute and try again.", "Couldn't sign in. Check your connection and try again."
- **Behavior:** The submit button shows a spinner and the fields lock. On success the session is stored, `me` loads, and the gate layer routes to tabs (or to Suspended). "Forgot password?" pushes S5 and carries the typed email. A failed sign-in keeps the typed email and clears nothing else.

### Screen S3: Create account
- **Fields (the web's, same order):** First name, Last name, Username, Email, Password, Confirm password. No invite code. Time zone is sent silently from the device (`Intl` resolved zone, validated by the server; an invalid value falls back to the server default).
- **Validation:** Client-side presence checks only, mirroring the shared `checkName`, `checkUsername`, and `checkEmail` parsers for instant feedback. The server's field errors (`validation_error.details`) are authoritative and shown under each field.
- **Bot challenge (S4):** When app-config's `botChallenge` is not null, a challenge card sits above the submit button. The button is disabled until the challenge yields a token. A failed submit resets the challenge, because a token is single-use. When `botChallenge` is null (the server's own development or Preview bypass is on), no card shows, exactly as on the web.
- **Form errors (web copy):** "An account with this email already exists. Sign in instead." (`conflict`), "Couldn't verify you're human. Try again." (challenge), "Signups are temporarily paused. Please try again soon." (paused), "Too many attempts. Wait a minute and try again." (`rate_limited`), "Couldn't create your account. Nothing was saved. Try again." (`internal_error`), "Signup isn't open right now." (closed).
- **Behavior:** On success the server returns a session. The app stores it, loads `me`, and lands on Today, signed in, with the 14-day trial the server granted shown in More. A failed submit never clears what was typed, except that a challenge failure resets only the challenge.

### Screen S4: Bot challenge (embedded)
- **Purpose:** Honor Cloudflare Turnstile in a native form.
- **Layout:** A 72-point-tall bordered card containing a small web view that renders the Turnstile widget in managed mode with the app's theme ("light" or "dark").
- **Behavior:** The web view loads an inline page whose origin is the backend's canonical web origin (from app-config). It loads only Cloudflare's script and allows navigation to nothing else. The widget posts its token back to the app, and the token is held in memory only, never stored. On expiry or error the card shows "Verification expired. Tap to retry." or "Couldn't load the check. Tap to retry."
- **Unreachable:** If Cloudflare cannot load, the card says so, and the submit stays disabled.

### Screen S5: Reset password (request)
- **Fields:** Email, plus the bot challenge card when required.
- **Behavior:** "Send reset link" calls the API. A malformed email or a failed challenge is reported inline. Every other outcome shows the identical sent state: "Check your email. If an account exists for {email}, a link to reset its password is on the way. The link works once and expires in 1 hour. Nothing after a few minutes? Check spam, or send it again." The link opens the web (`/auth/confirm` → `/reset-password`), never the app. "Back to sign in" pops to S2.

### Gate G1: Launching
The native splash (Overload mark on `background`) stays up while the stored session is read and app-config is fetched, for at most about one second. After that a centered activity indicator with "Opening Overload…" replaces it until the gate decides.

### Gate G2: Update required
- **Trigger:** app-config's `minimumAppVersion` is above the running app version, or any API call answers 426 `upgrade_required`.
- **Copy:** "Update Overload" / "This version is no longer supported. Install the latest version to keep training." In a development or staging build, the action is "Check for update" (fetches an over-the-air update), and a caption shows the running and minimum versions. A store link comes in 21l.
- **Blocking:** No navigation behind it. The session is kept.

### Gate G3: Maintenance
- **Trigger:** app-config `killSwitches.maintenance: true`.
- **Copy:** "Overload is down for maintenance" / "Your data is safe. Try again in a few minutes." Action: "Try again" (re-fetches app-config). The session is kept.

### Gate G4: Unreachable
- **Trigger:** A network failure, a timeout, a 5xx, or a non-JSON answer from the API while there is nothing usable to show.
- **Copy:** "Can't reach Overload" / "Overload needs a connection. Check your signal or Wi-Fi and try again." Action: "Try again". It also retries automatically when the network comes back and when the app returns to the foreground. The session is kept.

### Gate G5: Account suspended
- **Trigger:** `me` (or any call) answers 403 `account_suspended`.
- **Copy:** "This account is suspended" / "You can still download your data or delete your account on the web." Actions: "Open Overload on the web" and "Sign out". This matches the web's suspended wall and its export and deletion exception.

### Gate G6: Staging access (development and staging builds only)
- **Trigger:** A request to the staging API was answered by Vercel Deployment Protection (an HTML 401, or a redirect to Vercel's login) instead of the API.
- **Copy:** "This build needs staging access" / "Paste the mobile staging access key from the runbook. It's stored only on this device." A secure text field, "Save", and "Paste". A saved key can be removed in Diagnostics.
- **Never compiled into a production build** (spec §7). It never appears for the API's own 401, which means the token is invalid.

### Screens T1–T4: Tabs
- **T1 Today:** A large title "Today" and the account-local date ("Saturday, November 14"), computed with the shared calendar helpers in the account's time zone from `me`. An empty-state card follows: "Workout logging is coming to the app next. For now, log today's training on the web." Action: "Open Overload on the web".
- **T2 History, T3 Plan, T4 Goals:** Each has a large title and an empty state with an SF Symbol: "{History|Your plan|Goals} comes to the app in a later update. It's all on the web now." Action: "Open on the web".
- **States:** These read nothing beyond `me`, so they have no loading or error state of their own. The gate layer has already loaded `me`.

### Screen M1: More
A grouped list:
1. **Account card:** full name, @username, email, and an "Email verified" check when verified.
2. **Plan:** a read-only row with the server's plan label (for example "Pro trial · 9 days left", "Pro", "Free"), from `me.entitlement`. No purchase link, price, or upgrade button.
3. **App:** Appearance (value on the right), then Exercises and Gyms (both "On the web" with an external-link glyph).
4. **Account:** "Manage account on the web" (profile, export, deletion, and billing live there for now).
5. **Sign out** (destructive text). It confirms with a system alert, "Sign out of Overload on this iPhone?", with "Sign out" (destructive) and "Cancel".
6. **Footer caption:** "Overload {version} · Staging", plus a Diagnostics row in non-production builds.

Pull to refresh re-fetches `me`.

### Screen M2: Appearance
A checkmark list with System, Light, and Dark. The footer explains: "System follows your iPhone's setting." Selecting applies immediately and saves to the account. If the save fails, the previous choice returns and an inline banner says "Couldn't save your appearance. Try again." Concurrent taps are ordered so the last choice wins, as on the web (`createChoiceTracker` semantics).

### Screen M3: Diagnostics (development and staging builds only)
Read-only facts for the owner's review:
- the environment (staging), the API host, and the Supabase project ref;
- the update channel, runtime version, update id and its time, and whether the running bundle is embedded or downloaded;
- the app version, and whether a staging access key is stored, with "Remove";
- a "Hermes date and time-zone checks" block that runs the spike's checks live and shows pass or fail for each.

It never shows a token, a key value, an email, or a password.

## 7. Navigation flows

```text
cold start ──> G1 ──> app-config ──┬─ below minimum ─────> G2 (blocking)
                                   ├─ maintenance ───────> G3 (blocking)
                                   ├─ unreachable, no session ─> G4
                                   └─ ok ──> session? ──┬─ no ──> S1 Welcome
                                                        └─ yes ─> me ──┬─ 200 ─> Tabs (Today)
                                                                       ├─ 403 suspended ─> G5
                                                                       ├─ 401 → refresh once ─┬─ ok → me
                                                                       │                      └─ rejected → S1 (signed out)
                                                                       └─ unreachable ─> G4 (session kept)

S1 ─> S2 ─(success)─> me ─> Tabs           S2 ─> S5 ─(sent)─> back to S2
S1 ─> S3 ─(success, session returned)─> me ─> Tabs
More ─> Sign out ─(confirm)─> S1           any call 426 ─> G2
resume from background ─> re-check app-config (at most once a minute) and refresh the token if near expiry
```

The system back gesture works on every pushed screen. Gates replace the whole tree, so there is nothing to go back to.

## 8. Interaction specifications

- **Keyboard:** Forms sit in a keyboard-aware scroll view. The focused field and the primary button are never covered. Return moves to the next field, and the last field submits. A tap outside dismisses the keyboard.
- **Loading:** Buttons show an inline spinner and keep their width. Screens never flash a spinner shorter than about 300 ms.
- **Errors:** Field errors sit under the field in `destructive` and are announced to VoiceOver. A form error sits in an inline banner above the primary button. Nothing is a floating toast.
- **Haptics:** A success haptic on sign-in, signup, and a sent reset request. A warning haptic on a form error. Nothing decorative.
- **Destructive actions:** Only Sign out, confirmed with a system alert.
- **Lifecycle:** On foreground, the app restarts the token auto-refresh and re-checks app-config (throttled to once a minute). On background, it stops auto-refresh. An expired access token refreshes before the next request, and a 401 triggers exactly one refresh-and-retry.

## 9. Responsive behavior

iPhone portrait is the target, from iPhone SE (375 points wide) to Pro Max. Landscape is supported by the system but not designed for, and forms remain scrollable. iPad runs the iPhone layout (`supportsTablet: false`). Safe areas are respected on every screen, including the home indicator under the tab bar and the notch or Dynamic Island under large titles.

## 10. Component inventory (native, `apps/mobile/src/ui`)

| Component | Use |
| --- | --- |
| `ThemeProvider` / `useTheme` | Token-to-style mapping and the appearance resolution |
| `Text` | Inter, token sizes and weights, tabular numerals |
| `Button` | Primary, secondary, and destructive-text variants, with loading |
| `TextField` | Label, input, field error, focus ring, `secureTextEntry` |
| `FormScreen` | Keyboard-aware scroll view with safe-area padding |
| `Banner` | Inline info and error message |
| `GroupedList`, `ListRow` | The More screen and Appearance |
| `StateView` | The shared loading, empty, error, and unreachable states (icon, title, one sentence, one action) |
| `GateScreen` | The full-screen blocking variant of `StateView` |
| `BotChallenge` | The Turnstile web view card |
| `EnvironmentBadge` | "Staging" in non-production builds |

Nothing else. Later slices extend this set.

## 11. Accessibility, privacy, and data sensitivity

- **VoiceOver:** Every control has a label. Field errors are linked and announced. Gate screens move focus to their title.
- **Contrast:** Token pairs meet WCAG AA for body text in both appearances. Primary on background is used for large text and controls only.
- **Reduce Motion:** No custom animations. System transitions only.
- **Secrets:** Tokens live only in the device's secure storage (Keychain through `expo-secure-store`). They are never logged, never put in a URL, and never in app state that is persisted elsewhere. The staging access key also lives only in secure storage. The Turnstile token lives in memory for one submit.
- **Personal data:** The email and name appear only on the signed-in account's own More screen. No analytics, crash reporting, or third-party tracking is added.
- **Production isolation:** The build refuses to start with a Production API or Supabase project (spec §7).

## 12. Out of scope

Workout logging, Today's planned session list, history, plan, goals, the exercise library, gyms, the native tour, What's New, the trial notice dialog, profile editing, export, deletion, billing, social login, offline anything, Android, TestFlight, and the store. The `me` fields `tour`, `whatsNew`, and `trialNotice` are fetched but not rendered until their slices (21j, 21k).

## 13. User guidance

No tour step and no release note. The web is unchanged, and the native tour comes in 21k. A What's New entry for the iPhone app is written when the friends' beta ships (21l).

## 14. Plan placement and client scope

**Plan placement:** Free. Every surface here works for every account. The plan row is display-only, from the server's `entitlement.displayState` and its label.

| Surface | Shared logic | Mobile API | Web UI | Mobile UI | Reason |
| --- | --- | --- | --- | --- | --- |
| Sign in | Sign-in error classification and messages | — (Supabase Auth directly) | Login imports the moved messages; no visible change | S2 | Supabase Auth issues tokens; the anon key cannot create accounts |
| Sign up | Field parsers; request type | `POST /accounts` (public, version-gated) | — | S3, S4 | Same `signUp` module and defenses as the web |
| Reset request | Request type | `POST /password-reset` | — | S5 | Same `requestPasswordReset` module; completion stays on the web |
| App config | `AppConfigDto.botChallenge` | `GET /app-config` (additive field) | — | Gates G2, G3, S3/S4 | One version and maintenance authority |
| Account state | `MeDto` (unchanged) | `GET /me` | — | Gates, M1, T1 | Plan state comes from the server |
| Appearance | `APPEARANCES` | `PUT /me/appearance` | — | M2 | Reuses `updateAppearance`, an absolute write and retry-safe |

## 15. Mobile design (the native visual contract)

Navigation: Expo Router. A root stack holds the gate layer, the `(auth)` stack uses native stack headers, and `(tabs)` uses the **system tab bar** (Expo Router native tabs, which is UIKit's `UITabBarController`), with SF Symbols. Each tab owns a native stack with large titles. All wireframes are iPhone portrait at 393 points wide, light appearance. Dark uses the same layout with the dark tokens.

### S1 Welcome
```text
┌──────────────────────────────────┐
│            (status bar)          │
│                                  │
│                                  │
│         ▲ OVERLOAD               │  lockup: mark + Inter 600 wordmark
│      [ Staging ]                 │  EnvironmentBadge (non-prod only)
│                                  │
│  Train on your plan. Know when   │  base 16/24, mutedForeground,
│  to add weight.                  │  centered, max 2 lines
│                                  │
│                                  │
│                                  │
│ ┌──────────────────────────────┐ │
│ │           Sign in            │ │  primary, 48 high
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │       Create an account      │ │  secondary
│ └──────────────────────────────┘ │
│        (home indicator)          │  buttons pinned above safe area
└──────────────────────────────────┘
```
Native components: `View` plus safe-area insets, `Pressable` buttons. No header bar. Differs from the web's landing page by design: no marketing copy. One line, two actions, thumb-reachable at the bottom.

### S2 Sign in
```text
┌──────────────────────────────────┐
│ ‹ Back          Sign in          │  native stack header (small title)
│                                  │
│  Email                           │  label sm 500
│ ┌──────────────────────────────┐ │
│ │ you@example.com              │ │  TextField 44, email keyboard
│ └──────────────────────────────┘ │
│  Password                        │
│ ┌──────────────────────────────┐ │
│ │ ••••••••••                   │ │  secure, Keychain autofill
│ └──────────────────────────────┘ │
│                   Forgot password?│  text button, primary color, 44 tall
│ ┌──────────────────────────────┐ │
│ │ ⚠ Wrong email or password.   │ │  Banner (error), only when set
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │           Sign in            │ │  primary 48, spinner when pending
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
        ▲ keyboard pushes content up; button stays visible
```
iOS password autofill (`textContentType`) works with saved Keychain passwords for the web domain once 21l adds associated domains. Until then the system autofill still offers saved passwords.

### S3 Create account (with S4)
```text
┌──────────────────────────────────┐
│ ‹ Back       Create account      │
│ ┌─────────────┐ ┌──────────────┐ │
│ │ First name  │ │ Last name    │ │  two-up on ≥ 375 pt, stacked if
│ └─────────────┘ └──────────────┘ │  Dynamic Type is accessibility size
│  Username                        │
│ ┌──────────────────────────────┐ │
│ │ troy                         │ │  ascii-capable, no autocorrect
│ └──────────────────────────────┘ │
│  Email                           │
│ ┌──────────────────────────────┐ │
│ └──────────────────────────────┘ │
│  Password                        │
│ ┌──────────────────────────────┐ │  textContentType newPassword
│ └──────────────────────────────┘ │  (iOS strong-password suggestion
│  Confirm password                │   fills both)
│ ┌──────────────────────────────┐ │
│ └──────────────────────────────┘ │
│  At least 8 characters…          │  password hint, xs muted (server rule text)
│ ┌──────────────────────────────┐ │
│ │ [✓] Verified          ⓒ CF   │ │  S4 BotChallenge card, 72 tall
│ └──────────────────────────────┘ │  (only when botChallenge != null)
│ ┌──────────────────────────────┐ │
│ │        Create account        │ │  disabled until token (if required)
│ └──────────────────────────────┘ │
│  Already have an account? Sign in│
└──────────────────────────────────┘
```
The whole form scrolls. A field error appears directly under its field. The trial is not advertised here (the web's signup doesn't either). It appears in More after signup.

### S5 Reset password
```text
 request state                         sent state
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ ‹ Back     Reset password    │     │ ‹ Back     Reset password    │
│                              │     │                              │
│ Enter your account's email   │     │ Check your email             │  xl 600
│ and we'll send a reset link. │     │ If an account exists for     │
│  Email                       │     │ you@example.com, a link to   │
│ ┌──────────────────────────┐ │     │ reset its password is on the │
│ └──────────────────────────┘ │     │ way. The link works once and │
│ ┌──────────────────────────┐ │     │ expires in 1 hour.           │
│ │ S4 BotChallenge          │ │     │ Nothing after a few minutes? │
│ └──────────────────────────┘ │     │ Check spam, or send it again.│
│ ┌──────────────────────────┐ │     │ ┌──────────────────────────┐ │
│ │     Send reset link      │ │     │ │     Back to sign in      │ │  secondary
│ └──────────────────────────┘ │     │ └──────────────────────────┘ │
└──────────────────────────────┘     └──────────────────────────────┘
```

### Gates G2–G6 (shared `GateScreen`)
```text
┌──────────────────────────────────┐
│                                  │
│                                  │
│              ( ⟳ )               │  SF Symbol 44 pt, mutedForeground
│                                  │  (arrow.down.app / wrench / wifi.slash
│        Can't reach Overload      │   / lock / key)
│                                  │  xl 600, centered
│   Overload needs a connection.   │  base, mutedForeground, centered
│   Check your signal or Wi-Fi     │
│   and try again.                 │
│                                  │
│ ┌──────────────────────────────┐ │
│ │          Try again           │ │  primary 48, bottom-anchored
│ └──────────────────────────────┘ │
│        secondary text action     │  e.g. "Sign out" on G5
└──────────────────────────────────┘
```
G6 adds a secure text field and "Paste" above the primary "Save".

### T1 Today (signed in)
```text
┌──────────────────────────────────┐
│ Today                            │  large title (native, collapses)
│ Saturday, November 14            │  base, mutedForeground (account tz)
│                                  │
│ ┌──────────────────────────────┐ │
│ │ ◷  Workout logging is coming │ │  StateView (card variant)
│ │    to the app next.          │ │
│ │    For now, log today's      │ │
│ │    training on the web.      │ │
│ │  ┌────────────────────────┐  │ │
│ │  │ Open Overload on the web│ │ │  secondary button
│ │  └────────────────────────┘  │ │
│ └──────────────────────────────┘ │
│                                  │
├──────────────────────────────────┤
│  ◉ Today  ◷ History ☰ Plan ◎ Goals ⋯ More │  system tab bar (SF Symbols:
└──────────────────────────────────┘  sun.max, clock.arrow.circlepath,
                                      list.bullet.rectangle, target,
                                      ellipsis.circle)
```
T2–T4 use the same structure without the date line.

### M1 More
```text
┌──────────────────────────────────┐
│ More                             │  large title
│ ┌──────────────────────────────┐ │
│ │ Troy Rhodes                  │ │  lg 600
│ │ @troy · you@example.com  ✓   │ │  sm muted; ✓ = email verified
│ └──────────────────────────────┘ │
│  PLAN                            │  xs 500 uppercase section header
│ ┌──────────────────────────────┐ │
│ │ Plan            Pro trial ·9d│ │  read-only, no chevron
│ └──────────────────────────────┘ │
│  APP                             │
│ ┌──────────────────────────────┐ │
│ │ Appearance          System › │ │
│ │ Exercises         On the web↗│ │
│ │ Gyms              On the web↗│ │
│ └──────────────────────────────┘ │
│  ACCOUNT                         │
│ ┌──────────────────────────────┐ │
│ │ Manage account on the web  ↗ │ │
│ │ Sign out                     │ │  destructive color
│ └──────────────────────────────┘ │
│  Overload 0.1.0 · Staging        │  xs muted, centered
│  Diagnostics ›                   │  non-prod only
└──────────────────────────────────┘
```

### M2 Appearance
```text
┌──────────────────────────────────┐
│ ‹ More        Appearance         │
│ ┌──────────────────────────────┐ │
│ │ System                     ✓ │ │  checkmark in primary
│ │ Light                        │ │
│ │ Dark                         │ │
│ └──────────────────────────────┘ │
│  System follows your iPhone's    │  footer xs muted
│  setting.                        │
└──────────────────────────────────┘
```

### Differences from the web, and why
- **Navigation:** The system tab bar instead of the web's rail or menu sheet. More holds account items, as iOS apps do.
- **No marketing landing:** The app's first screen is Welcome. The web's landing page stays web-only (roadmap).
- **Errors inline, no toasts:** A floating web toast does not exist natively (`overload-mobile-ui`).
- **Signup returns the session:** The server signs the new account in and hands the app its session, so the app makes no second sign-in. The web gets the same effect through its cookie.
- **Placeholders:** The web has the features. The app says so and links out.

### States checklist (every screen)
Loading (a button spinner, or G1), empty (T1–T4 placeholders), error (field and form banners), unreachable (G4, and inline in S3/S5), locked (not used: no Pro surface in this slice), and version gate (G2). A failed submit never discards what the lifter typed.
