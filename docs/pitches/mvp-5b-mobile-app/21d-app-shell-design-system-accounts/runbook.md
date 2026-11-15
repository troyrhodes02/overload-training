# Pitch 21d — App Shell, Design System & Accounts: Owner Runbook

**What changed outside the code:**

- **EAS project:** `@wtrhodes/overload` (id `3b322e4a-1bf6-422e-9feb-3aa859dffb46`), with two plaintext variables in its `development` environment: `EXPO_PUBLIC_OVERLOAD_ENV=staging`, and the overload-dev anon key (public by design).
- **Your Mac:** CocoaPods 1.17 installed with Homebrew, for local simulator builds.

There is no database migration, no Supabase change, no Production change, and no store, TestFlight, or production update channel.

Every mobile artifact in this slice is **staging-only**. `app.config.ts` refuses any other environment, an anon key from another Supabase project, any `EXPO_PUBLIC_*` value naming Production, any EAS profile except `development` and `development-simulator`, and any channel except `staging`. The app checks the same rules again at launch.

## 1. One-time setup on your Mac

From the repository root, on the feature branch (or `staging` after the merge):

```bash
npm ci
# Public values only: the environment name and the overload-dev anon key.
cd apps/mobile
cp .env.example .env.local
# Paste the staging (Preview) value of NEXT_PUBLIC_SUPABASE_ANON_KEY after EXPO_PUBLIC_SUPABASE_ANON_KEY=
# (Vercel → overload-training → Settings → Environment Variables → Preview).
```

`apps/mobile/.env.local` is gitignored. The config refuses a key that isn't overload-dev's.

## 2. Staging access key (you create it once; security setting)

The staging URL keeps Vercel Deployment Protection. The app reaches it with a **Protection Bypass for Automation** secret that is entered on each device and stored only in that device's Keychain. It is never in the code, a build, or an update.

1. Vercel → `overload-training` → Settings → Deployment Protection → Protection Bypass for Automation → **Add secret**, with the note `Mobile development builds`. Keep it separate from the Stripe webhook secret, so you can revoke either one alone.
2. Copy the value. On first launch the app shows **"This build needs staging access"**. Paste the key there (Universal Clipboard works from the Mac to the iPhone and the simulator) and tap **Save**.
3. To revoke: delete the secret in Vercel, then use More → Diagnostics → **Remove access key** on each device.

## 3. Checkpoint A — iOS Simulator

```bash
npm run ios -w @overload/mobile     # first time: prebuild + pods + build + install (about 10 min)
npm run start -w @overload/mobile   # Metro; later launches need only this
```

In the simulator, open **Overload Dev**. Development builds open Metro from the dev launcher, so tap the listed server, or **Enter URL manually** `http://localhost:8081`. iOS asks "Open in Overload Dev?" the first time; tap **Open**. Metro's log prints `[hermes-checks] 16/16 passed on Hermes` at launch.

Check, and reply with a pass or fail for each:

| # | Check | Expected |
| --- | --- | --- |
| A1 | Launch | The splash, then "This build needs staging access" (no key yet). After you paste the key: Welcome (logo, "Staging" badge, Sign in, Create an account) |
| A2 | Sign in as `overload-staging-tester@example.com` | Lands on **Today** with today's date in the account's zone. A wrong password says "Wrong email or password." and keeps the email |
| A3 | Tabs | Today, History, Plan, Goals, More: the system tab bar, with honest "comes to the app in a later update" placeholders and "Open on the web" |
| A4 | More | The tester's name and email, the plan row reads the trial or Pro label (no purchase button), plus Appearance, Exercises, Gyms, Manage account, and Sign out |
| A5 | Appearance (on screen) | More → Appearance → Dark, then Light, then System: the whole app, tab bar, and status bar follow each tap at once. Device Settings → Dark Mode while on System also follows. **Before the merge**, staging has no save endpoint, so each choice then returns to the account's saved one with "Couldn't save your appearance. Try again." That is expected; saving is D4 |
| A6 | Keyboards and safe areas | Sign-in and Create account: fields stay visible above the keyboard, Return moves to the next field, nothing sits under the notch or home indicator |
| A7 | Diagnostics | More → Diagnostics: API host is the staging URL, Supabase project is `vdxrmfadikwzodjljbdi`, engine is Hermes, every date check passes, and the access key shows only "Stored" (never its value). Diagnostics exists only in staging builds (RD-25) |
| A8 | Sign out | More → Sign out → confirm, back to Welcome. Relaunch, and you're still signed out |

## 4. Checkpoint B — Physical iPhone (Apple signing: you, once)

EAS needs your Apple Developer login once, interactively, to create the development certificate and the provisioning profile:

```bash
cd apps/mobile
eas device:create                                   # open the link on the iPhone, install the profile
eas build --profile development --platform ios      # log in to Apple when asked; let EAS manage credentials
```

When the build finishes, open its page on the iPhone (or scan the QR code) and install it. Developer Mode is already on. Launch **Overload Dev**, connect to your Mac's Metro (same Wi-Fi), or use the staging update from §5. Then paste the staging access key.

| # | Check | Expected |
| --- | --- | --- |
| B1 | Install and launch | The icon is the Overload mark. It launches with no crash |
| B2 | Staging only | More → Diagnostics shows the staging URL and `vdxrmfadikwzodjljbdi` |
| B3 | Sign in | The tester signs in and Today shows the right date |
| B4 | Session persists | Force-quit and reopen: still signed in. Reboot the phone and reopen: still signed in |
| B5 | Background and resume | Background for more than an hour (the access token expires), then reopen: still signed in, with no error |
| B6 | Outage is not sign-out | Airplane Mode on, reopen the app: "Can't reach Overload". Airplane Mode off, tap **Try again**: back in, still signed in |
| B7 | Sign out | It clears the session. Reopen, and Welcome shows |
| B8 | Haptics, VoiceOver | A light success tap on sign-in. VoiceOver reads every field and button |

## 5. Checkpoint C — a staging over-the-air update

An update carries JavaScript, styles, and assets only. It reaches only builds with the same native fingerprint (the build's **runtime**). Publish from the repository root, from a clean commit that is on GitHub:

```bash
npm run mobile:update:staging                     # or: -- --message "Checkpoint C retry"
```

The script refuses uncommitted changes, an unpushed commit, any channel, branch, or platform option, anything naming Production, and a runtime that no finished staging development build has. It prints `Runtime f98506f78a: 1 staging development build(s) can receive this update`, then eas-cli's summary: branch `staging`, platform `ios`, the **update group ID**, the **iOS update ID**, and a message that starts with the commit. (Don't use the old `npm run update:staging -w @overload/mobile`: it has none of these guards. It stays only because editing the mobile `package.json` scripts would change the fingerprint and cut this build off from every update. It goes at the next native rebuild.)

**Open the update on the iPhone (SDK 58 dev launcher):**

1. Open **Overload Dev**. If it reopens the last project, shake the phone → **Go home** to reach the launcher.
2. Tap **Enter URL manually** and enter the channel URL: `https://u.expo.dev/3b322e4a-1bf6-422e-9feb-3aa859dffb46?channel-name=staging`. It opens the newest update on `staging` for this runtime. To pin one update exactly, enter `https://u.expo.dev/update/<iOS update ID>` instead. Typing is easiest from a Note synced from the Mac, or with Universal Clipboard.
3. The launcher's **Updates** tab is optional. It lists updates only when the launcher is signed in (account icon, top right) to an Expo account that can read the private project `@wtrhodes/overload`. With any other account, Expo's API returns no data, and the tab shows "Error loading updates — Failed to decode response: The data couldn't be read because it is missing". That is an account problem, not an app problem.

**Diagnostics on the update** (More → Diagnostics), exactly:

| Row | Expected |
| --- | --- |
| Environment / API / Supabase project | `staging` / the `overload-training-git-staging-…vercel.app` host / `vdxrmfadikwzodjljbdi` |
| App version / JavaScript engine | `0.1.0` / `Hermes` |
| Access key | `Stored`, never its value |
| Running | `EAS update` (Metro reads `Metro (development)`) |
| Update group | the first 8 characters of the publish's **update group ID** |
| Commit | the 7 characters at the start of the update message |
| Published | the publish time, in UTC |
| Channel | `Not set (opened by URL)`, because the launcher opens an update by its URL, not through the build's channel |
| Runtime | `f98506f78a` |
| Hermes checks | `16 of 16 passed.` |

| # | Check | Expected |
| --- | --- | --- |
| C1 | Publish | The script prints the receiving build and the staging branch, the update group, and the commit. Nothing says "production" |
| C2 | Receive | Diagnostics matches the table above, with this publish's group and commit |
| C3 | Cold launch on the update | Force-quit, reopen, and open the update again. Signed in: Today (never "Unmatched Route"). An unknown link goes home |
| C4 | Sign out and in on the update | Sign out → Welcome. Sign in → Today |

## 6. Signup, the reset request, and appearance on staging

Native signup (`POST /api/mobile/v1/accounts`), the reset request (`POST /api/mobile/v1/password-reset`), and saving appearance (`PUT /api/mobile/v1/me/appearance`) are **new web endpoints in this slice**. They reach the staging URL only when the feature branch merges into `staging`. Before the merge, these three show the API's 404 in the app. After the merge (or on a local API, below):

| # | Check | Expected |
| --- | --- | --- |
| D1 | Create account with a throwaway `…@example.com` | Lands on Today, signed in. More shows "Pro — trial · 14d". Staging has `TURNSTILE_DISABLED=true` on Preview, so no challenge card shows, exactly as the web hides its widget |
| D2 | Same email again | "An account with this email already exists. Sign in instead." |
| D3 | Reset password | The identical "Check your email" text for a real and an unknown email. The real one gets the email; its link opens the **web** reset page |
| D4 | Appearance | Dark, then Light, then System each stay, with no error. Sign out and back in: the last choice returns. The web shows it after a reload |

**D3's link must open the web reset form (owner Supabase check, `overload-dev` only).** Since the recovery fix (RD-31) the app sends Supabase the reset destination, this deployment's `/auth/confirm`. Supabase → `overload-dev` → Authentication:

1. **Emails → Reset Password.** The link's `href` must be exactly `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery`, the same form as the Magic Link template. If it shows `{{ .ConfirmationURL }}` (Supabase's default), replace it. Keep the subject and text from the Pitch 18 design ("Reset your Overload password").
2. **URL Configuration → Redirect URLs** includes `https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app/**`. Supabase silently swaps any destination not on this list for the Site URL, which is the home page.

Don't change Production's template now: Production's code doesn't send a destination yet, so a `{{ .RedirectTo }}` link there would break its reset. It changes with the 21d release (the release runbook says when).

 Saving appearance could not be checked on a device before, because staging had no `PUT /api/mobile/v1/me/appearance`. With the QA account on the iPhone (the installed build already has the client; no new update is needed):

1. Open the app (Metro or the staging update), More → **Appearance**.
2. Tap **Dark**. The app turns dark and stays dark, with no "Couldn't save your appearance".
3. Tap **Light**, then **System**. Each stays, with no error.
4. More → **Sign out**, then sign in again. More → Appearance shows **System**.
5. On the web (staging URL), sign in as the same account, reload Settings: Appearance shows **System**.

End on **System**: it is the QA fixture's baseline value (`npm run qa:verify` checks it).

**Optional, the challenge card itself:** run the web locally with Cloudflare's always-pass test keys (`NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`, `NEXT_PUBLIC_APP_URL=http://localhost:3200`, `OVERLOAD_SIGNUP_MODE=public`, and the overload-dev database and Supabase values), with `next build && next start -p 3200`. Then add `EXPO_PUBLIC_LOCAL_API_ORIGIN=http://localhost:3200` to `apps/mobile/.env.local` (simulator) or your Mac's LAN IP (iPhone). Only Metro development bundles honor it. The card shows Cloudflare's test widget, and signup succeeds only after it passes.

**Optional, the gates:** in Vercel's **Preview** scope, set `MOBILE_MIN_APP_VERSION=9.9.9` (expect "Update Overload") or `MOBILE_MAINTENANCE=true` (expect "Overload is down for maintenance"), redeploy `staging`, check, then remove the variable and redeploy again.

## 7. Update or rebuild?

| You changed | Do this |
| --- | --- |
| TypeScript, screens, styles, copy, or images in `apps/mobile/src` or `packages/shared` | `npm run mobile:update:staging` (root). No rebuild needed |
| A package with native code, a config plugin, `app.config.ts` native fields (name, bundle id, permissions, plugins), or the Expo SDK | `eas build --profile development --platform ios` (iPhone) or `npm run ios -w @overload/mobile` (simulator), then reinstall. The fingerprint changes, so the old build never receives the new update |

`npx expo-doctor` (run from `apps/mobile`) and `eas fingerprint:compare` show whether a change is native. Editing `apps/mobile/package.json` (even its `scripts`) changes the fingerprint too; the publish script refuses when that leaves no receiving build.

## 8. What stays yours

- Creating the staging access secret (§2).
- The Apple login for EAS credentials and device registration (§4).
- The device checks (A, B, C, D) and approving them in the feature PR.
- After the friends' beta decision (21l): a Production environment, bundle id, and store build. **Never** from this slice.

## 9. Verification record

| Checkpoint | Result | Who, when |
| --- | --- | --- |
| A — Simulator | Passed after 7c13b93: sign-in lands on Today, sign-out on Welcome, no Unmatched Route, no endless "Opening Overload". Appearance applied on screen; before the merge each save returned "Couldn't save" (the endpoint was not on staging) | Owner, interactively, 2026-11-14 |
| B — iPhone | Passed: B1 install and launch, B2 staging only, B3 the QA account signs in, B4 the session survives force-quit and reopen, B7 sign-out returns to Welcome | Owner, EAS development build 86e673d0 (commit 30b8bb5), 2026-11-14 |
| C — Staging update | Passed: update group `a9f12f47` (commit 5fdb90b, runtime `f98506f78a`) opened by URL. Diagnostics showed that update and commit. On the update: force-quit and reopen → Today; sign out → Welcome; sign in → Today. No Unmatched Route or endless loading | Owner, 2026-11-15 |
| D — After the merge | **D4 passed:** appearance saves to the account and works on staging. D1–D3 (signup, duplicate email, reset request) still to run (§6) | Owner, iPhone, 2026-11-15 (after 5c41813) |

**Not performed, so unverified (DoD 45):** B4's phone reboot, B5 (background for more than an hour), B6 (Airplane Mode outage), B8 (haptics and VoiceOver), and the Turnstile card in a real web view (optional local test, §6). Automated tests cover the logic behind B5 and B6 (session-transitions and gate suites).
