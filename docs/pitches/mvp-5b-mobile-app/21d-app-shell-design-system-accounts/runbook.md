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
| A5 | Appearance | More → Appearance → Dark, then Light, then System: the whole app, tab bar, and status bar follow. Device Settings → Dark Mode while on System also follows. The choice shows on the web after a reload |
| A6 | Keyboards and safe areas | Sign-in and Create account: fields stay visible above the keyboard, Return moves to the next field, nothing sits under the notch or home indicator |
| A7 | Diagnostics | More → Diagnostics: API host is the staging URL, Supabase project is `vdxrmfadikwzodjljbdi`, engine is Hermes, and every date check passes |
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

An update carries JavaScript, styles, and assets only. It reaches only builds with the same native fingerprint.

```bash
npm run update:staging -w @overload/mobile -- --message "21d staging update check"
```

On the iPhone, in the dev launcher: **Extensions** (or **Updates**) → branch `staging` → open the newest update. Alternatively, an installed build checks on launch. Then More → Diagnostics → **Running** shows `Update xxxxxxxx` with the update's time, instead of "Embedded bundle".

| # | Check | Expected |
| --- | --- | --- |
| C1 | Publish | The command prints the `staging` channel and branch, and a group id. Nothing says "production" |
| C2 | Receive | Diagnostics shows the new update id and time |

## 6. Signup, the reset request, and appearance on staging

Native signup (`POST /api/mobile/v1/accounts`), the reset request (`POST /api/mobile/v1/password-reset`), and saving appearance (`PUT /api/mobile/v1/me/appearance`) are **new web endpoints in this slice**. They reach the staging URL only when the feature branch merges into `staging`. Before the merge, these three show the API's 404 in the app. After the merge (or on a local API, below):

| # | Check | Expected |
| --- | --- | --- |
| D1 | Create account with a throwaway `…@example.com` | Lands on Today, signed in. More shows "Pro — trial · 14d". Staging has `TURNSTILE_DISABLED=true` on Preview, so no challenge card shows, exactly as the web hides its widget |
| D2 | Same email again | "An account with this email already exists. Sign in instead." |
| D3 | Reset password | The identical "Check your email" text for a real and an unknown email. The real one gets the email; its link opens the **web** reset page |
| D4 | Appearance | Saves (A5) |

**Optional, the challenge card itself:** run the web locally with Cloudflare's always-pass test keys (`NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`, `NEXT_PUBLIC_APP_URL=http://localhost:3200`, `OVERLOAD_SIGNUP_MODE=public`, and the overload-dev database and Supabase values), with `next build && next start -p 3200`. Then add `EXPO_PUBLIC_LOCAL_API_ORIGIN=http://localhost:3200` to `apps/mobile/.env.local` (simulator) or your Mac's LAN IP (iPhone). Only Metro development bundles honor it. The card shows Cloudflare's test widget, and signup succeeds only after it passes.

**Optional, the gates:** in Vercel's **Preview** scope, set `MOBILE_MIN_APP_VERSION=9.9.9` (expect "Update Overload") or `MOBILE_MAINTENANCE=true` (expect "Overload is down for maintenance"), redeploy `staging`, check, then remove the variable and redeploy again.

## 7. Update or rebuild?

| You changed | Do this |
| --- | --- |
| TypeScript, screens, styles, copy, or images in `apps/mobile/src` or `packages/shared` | `npm run update:staging -w @overload/mobile`. No rebuild needed |
| A package with native code, a config plugin, `app.config.ts` native fields (name, bundle id, permissions, plugins), or the Expo SDK | `eas build --profile development --platform ios` (iPhone) or `npm run ios -w @overload/mobile` (simulator), then reinstall. The fingerprint changes, so the old build never receives the new update |

`npx expo-doctor` (run from `apps/mobile`) and `eas fingerprint:compare` show whether a change is native.

## 8. What stays yours

- Creating the staging access secret (§2).
- The Apple login for EAS credentials and device registration (§4).
- The device checks (A, B, C, D) and approving them in the feature PR.
- After the friends' beta decision (21l): a Production environment, bundle id, and store build. **Never** from this slice.
