# TestFlight Beta — Technical Specification

**Pitch:** `pitch.md`. **Design:** `design.md`; its §12 is the binding native visual contract. There is no `preview.tsx`. Step 3 is recorded as *Skipped — mobile-only pitch; the native visual contract is the Mobile design section, built with `/overload-mobile-ui`.* The visual review artifact is the design canvas (RD-20).

**Linear:** milestone "Pitch 21l — TestFlight Beta". Engineering: OVE-255, OVE-260, OVE-261. Human-gated: OVE-262 (build, App Store Connect, Check A), OVE-263 (privacy URL, review, Production release, invitations), OVE-264 (Check B, tour decision, closeout).

## 1. Summary

The accepted iPhone app gets a Production environment and build profile beside the unchanged staging ones, an About this app screen, the OVE-255 fixes, and a fix that lets a due account see What's New while the automatic tour is off. One release note, "Overload on iPhone", is added. The owner then builds and uploads with one command, smoke-tests the internal TestFlight build (Check A), completes Apple's beta review, invites one friend, and that friend logs a real workout (Check B).

## 2. Scope

**In scope.** Everything in design §11; the Production environment module and config; the `production` EAS build and submit profiles; tests; the release note; the runbook; the release PR for the server change and the note.

**Out of scope.** New features, MVP 5C, purchase flows, App Store submission, Android, Production data changes by the run, enabling `MOBILE_TOUR_AUTO_START`, publishing to the `production` update channel.

## 3. Build environments

| Value | Staging | Production |
| --- | --- | --- |
| `EXPO_PUBLIC_OVERLOAD_ENV` (eas.json `env`) | `staging` | `production` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` (EAS environment) | `development` env, overload-dev key | `production` env, Production public key |
| API origin (code constant) | `STAGING_API_ORIGIN` | `PRODUCTION_API_ORIGIN` = `https://www.overloadtraining.app` (the apex 308-redirects here; the client treats any redirect to another origin as a refusal, so the origin must be exact) |
| Supabase URL (code constant) | `https://vdxrmfadikwzodjljbdi.supabase.co` | `https://ycxvdiklpefyhdclxyau.supabase.co` |
| `EXPO_PUBLIC_LOCAL_API_ORIGIN` | honored in Metro `__DEV__` only | refused if present |
| EAS profile / channel | `development*` / `staging` | `production` / `production` |

**Fences** (each problem names a variable, never its value):

- Config time (`app.config.ts`): a Production target is any of `EXPO_PUBLIC_OVERLOAD_ENV=production`, `EAS_BUILD_PROFILE=production`, or `EAS_UPDATE_CHANNEL=production`. It must have all three consistent where set. Any `EXPO_PUBLIC_*` value naming staging (the overload-dev ref, the staging alias, `vercel.app`) is refused. A present anon key whose JWT ref isn't Production is refused. Any other target takes the existing staging path, unchanged, which still refuses Production.
- Launch (`src/config/env.ts`): `resolveMobileEnvironment` sends `production` to the Production check and everything else to the existing staging check. A failure is the misconfigured gate, with no network call.
- Tests pin both directions.

**Fingerprint invariant.** `packages/shared/src/mobile/environment.ts` and `tokens.ts` stay byte-identical (hashes pinned in `apps/mobile/tests/fingerprint-inputs.test.ts`). The Production module (`production-environment.ts`) is loaded by the config only for a Production target. Verified: the staging fingerprint stays `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`. Version and build number are excluded from Expo's fingerprint (verified by probe), so remote build numbers don't split runtimes.

## 4. App identity and build profiles

`app.config.ts` returns, for Production:

- `name: "Overload"`, `scheme: "overload"`, `version: "1.0.0"`;
- `ios.bundleIdentifier: "app.overloadtraining"`, `supportsTablet: false`, `config.usesNonExemptEncryption: false`;
- no `NSAppTransportSecurity` exception;
- the same updates URL and project, `checkAutomatically: "ON_LOAD"`, `runtimeVersion: { policy: "fingerprint" }`;
- the same plugins except `expo-dev-client`.

For staging, it returns exactly what it returns today.

`eas.json`:

- `cli.appVersionSource: "remote"`. Build numbers live on EAS per bundle id. The development builds already exist, and their build number isn't in the fingerprint.
- `build.production`: `distribution: "store"`, `channel: "production"`, `environment: "production"`, `env.EXPO_PUBLIC_OVERLOAD_ENV: "production"`, `autoIncrement: true`, Node `22.23.5`.
- `submit.production.ios`: no `ascAppId` until the record exists. The first interactive submit creates or finds it, and the runbook records the id afterwards.

**Version rules.** The marketing version is 1.0.0 for the whole beta. Each new binary gets the next build number automatically. A new marketing version is only for a future store release.

## 5. What's New on the phone (OVE-260)

`apps/web/src/lib/views/me.ts`:

```ts
const tourFirst = tourAutoStart && mobileTourAutoStartEnabled();
const trialNotice = tourFirst ? null : notice;
const whatsNew = tourFirst || trialNotice ? null : unseen;
// tour: { autoStart: tourAutoStart } — unchanged meaning: the account is due
```

`mobileTourAutoStartEnabled(env = process.env)` moves into `apps/web/src/lib/api/mobile/version.ts` and is the single reader of `MOBILE_TOUR_AUTO_START` (`=== "true"`). `app-config.tourAutoStart` uses it too.

**App.** `shouldShowWhatsNew` gains `tourActive`, and `WhatsNewSheet` passes `useTour().active`. The tour's own `due` check (`whatsNew === null`) stays, so two sheets can never meet.

**Release note** (top of `packages/shared/src/release-notes/entries.ts`):

- id `2026-11-26-overload-on-iphone`, date `2026-11-26`, PROVISIONAL: re-dated to the Production release day before the release merges;
- title "Overload on iPhone";
- body: "Overload now has an iPhone app, in a private beta for invited testers. Log your workouts, follow your plan and this week's schedule, and check your history, goals, exercises, and gyms, all on the same account as the web. If you're invited, install it with Apple's TestFlight app and sign in as usual.";
- `significant: true`, `audience: "internal"`.

## 6. Native changes (OVE-255, OVE-261)

| File | Change |
| --- | --- |
| `packages/shared/src/mobile/production-environment.ts` (new) | Production constants, `STAGING_MARKERS`, `checkProductionEnvironment`, `checkProductionEasTarget`, `isProductionTarget` |
| `packages/shared/src/mobile/app-environment.ts` (new) | `resolveMobileEnvironment`, type `MobileAppEnvironmentName = "staging" \| "production"` |
| `apps/mobile/app.config.ts` | target split; Production config (§4); staging unchanged |
| `apps/mobile/eas.json` | §4 |
| `apps/mobile/src/config/env.ts` | uses `resolveMobileEnvironment`; exports `BUILD_NUMBER` (expo-application) and `ENVIRONMENT_LABEL` |
| `apps/mobile/src/app-state/gate.ts` | `staging_protected` becomes `unreachable` when staging access isn't allowed |
| `apps/mobile/src/gates/Gates.tsx` | misconfigured wording (design §12) |
| `apps/mobile/src/ui/EnvironmentBadge.tsx` | nothing in Production |
| `apps/mobile/src/app/(tabs)/more/index.tsx` | footer text; About this app row |
| `apps/mobile/src/app/(tabs)/more/about.tsx` (new) | A1 |
| `apps/mobile/src/diagnostics/build-identity.ts` (new) | pure: the rows A1 shows |
| `apps/mobile/src/account/deletion-model.ts` | `checkAgainView` present → `stillHere` always |
| `apps/mobile/src/accounts/unauthorized-confirm.ts` (new) + `src/app/_layout.tsx` | the notice after a second look (§7) |

Staging access, Diagnostics, and the bypass header stay allowlisted to `staging`. They already refuse every other environment.

## 7. OVE-255 behavior

1. **Check again.** `checkAgainView({kind: "present"})` returns the form with `DELETE_MESSAGES.stillHere`, whatever the inventory. `identityPending` remains only for a delete answered `identity_pending`.
2. **Mid-deletion notice.** When `/me` fails with `unauthorized` (a 401 after a successful refresh), the app waits `CONFIRM_UNAUTHORIZED_MS = 2000` (beyond the web deletion's identity-removal window of about 750 ms with retries) and refetches `/me` once:
   - still `unauthorized`: show `FINISH_ON_WEB_NOTICE` and forget the session (today's behavior);
   - `signed_out` (the identity is gone and the refresh fails): forget the session with no notice;
   - success: nothing;
   - network or other error: forget nothing, and leave the normal unreachable handling.
   A `signed_out` first answer is unchanged (forget at once). The deletion module, the Stripe order, and `identity_pending` are untouched.

## 8. Security and privacy

**Secrets.** The binary holds the public anon key and public constants only. No service-role key, no Vercel bypass key, no Stripe key, no model key. `verify:client-bundle` and the iOS export scan run on both environments' bundles.

**Data inventory for Apple's privacy questions** (facts from the code; the owner makes the declarations):

| Data | Where it goes | Linked to the account | Purpose |
| --- | --- | --- | --- |
| Name, username, email, password (auth) | Overload (Supabase Auth, Vercel) | yes | account |
| Time zone, appearance | Overload | yes | app function |
| Plans, logged workouts and sets, RIR, cardio, goals, gyms (free-text location), custom exercises, favorites | Overload | yes | app function |
| Feedback text and an optional chosen screenshot | Overload (private Storage bucket) | yes | support |
| Plan and access state (read-only) | Overload (Stripe mirror) | yes | app function |
| Bot-challenge signals at sign-up and password reset | Cloudflare Turnstile, in a web view | no | security |
| Update checks: platform, runtime, a random per-install id (`EAS-Client-ID`) | Expo (EAS Update) | no | app updates |

There is no analytics, advertising, tracking, crash-reporting SDK, location, contacts, health data, camera, or microphone use. Photos are read only through the system picker when the lifter attaches a screenshot.

**Export compliance.** `ITSAppUsesNonExemptEncryption = NO`. The app uses only iOS's HTTPS and Keychain.

**Purchases.** The native Plan & access screen stays read-only, with no purchase link (21j). `me.trialNotice.purchasable` is always false.

## 9. API compatibility

- Production serves `4aacae7` (`dpl_9XfRoEUzkyf6mG5NkEvgef17YFPq`). `origin/main` and `origin/staging` differ only in three documentation files, so every endpoint the app calls is in Production with the same contract.
- The release candidate's only server change is §5, which changes which existing fields are null and is backward-compatible with every installed build.
- `minimumAppVersion` is `0.0.0`, so 1.0.0 and 0.1.0 both pass the gate. It isn't raised in this pitch.
- Live Production checks (no token, read-only): `app-config` 200 with `tourAutoStart: false` and the support address; `GET /me` 401 `unauthorized` JSON; the apex redirects to `www`.

## 10. Owner approval checkpoints

1. **Build** (OVE-262): the owner runs the build-and-submit command, which covers Apple sign-in and EAS cost.
2. **Check A** (OVE-262).
3. **Privacy policy URL and reviewer sign-in** (OVE-263).
4. **Beta App Review submission** (OVE-263). Apple decides.
5. **Production web release** of §5 (OVE-263), merged at the start of the beta.
6. **Recipients** (OVE-263).
7. **Check B** (OVE-264).
8. **`MOBILE_TOUR_AUTO_START=true`** on Production (OVE-264), proposed after Check B.

## 11. Testing

- **Shared/mobile environment** (`apps/mobile/tests/production-environment.test.ts`): a Production target with each staging marker, a staging anon key, a local API, a mismatched channel or profile; a staging target with Production values (existing tests); `resolveMobileEnvironment` for both; the config evaluated for both targets (identity fields, no dev client in Production, no ATS exception).
- **Fingerprint inputs:** `environment.ts` byte hash pinned; the config loads `production-environment.ts` only for a Production target.
- **Gate:** `staging_protected` → `unreachable` in Production; unchanged in staging.
- **About this app:** rows for Production, staging, local API, an EAS update, and an embedded bundle; no secret in any row.
- **OVE-255:** Check again with an empty and a non-empty inventory; the 401 confirmation for still-401, signed-out, success, and network.
- **What's New:** web integration `getMeView` with the gate on and off for a due account, and for finished and skipped accounts. The mobile sheet stays closed during a tour. The release-note catalog test validates the entry.
- **Standing suites:** format, lint, typecheck, workspace boundaries, web unit, mobile unit, integration (isolation included), the Production web build, client-bundle scan, iOS export for both environments, the export secret scan, and the staging fingerprint.

**Unverified by a run:** anything on a device or a simulator tap, including Turnstile in the Production sign-up web view; the EAS store build; Apple processing and review.

## 12. Acceptance criteria

1. The staging fingerprint is `2e4a65d9cd…`, and a staging update still targets build `c22ac9a0`.
2. A Production target with any staging value fails at config time and at launch.
3. A Production build resolves `www.overloadtraining.app` and the Production Supabase project, and About this app says so.
4. OVE-255's two cases behave as in §7.
5. A due account with the gate off gets What's New from `GET /me`; with the gate on, it doesn't until an outcome or offer is recorded.
6. All standing suites pass.
7. Check A and Check B pass (human).

## Resolved Decisions

| ID | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1–RD-15 | The owner's decisions in `pitch.md` §4 | Pre-resolved | Run prompt §5 |
| RD-16 | Production bundle id `app.overloadtraining`. Development keeps `app.overloadtraining.dev`. | Reverse-DNS of the domain, the pattern the development id set. Two ids keep both apps on one phone (RD-4). | 21d spec (decided in 21l); existing pattern |
| RD-17 | Home Screen name "Overload". The App Store Connect name falls back to a variant only if Apple says it's taken. | The brand. The store name must be unique; the display name need not be. | Brand; Apple naming rules |
| RD-18 | Version 1.0.0; EAS remote build numbers with auto-increment. | Remote numbering never repeats a build number. Versions are excluded from the fingerprint (verified). | Expo docs; probe |
| RD-19 | The Production allowlist is a new module loaded only for Production targets. `environment.ts` stays byte-identical. | Any byte change to a config-loaded file moves the staging runtime and cuts off build `c22ac9a0` (RD-4). | Fingerprint source (`loadedModules`); probe |
| RD-20 | The visual review artifact is the design canvas linked in the PR. Design §12 wins where they differ. | The required step-3 artifact for a mobile-only slice. | Pipeline guide §5 step 3 |
| RD-21 | About this app is a new screen in every build. Diagnostics stays staging-only. | The run prompt requires an on-device Production identity check. Diagnostics holds staging-only tools (21d RD-25). | Run prompt §11; 21d |
| RD-22 | The What's New hold applies only while `MOBILE_TOUR_AUTO_START` is on. The fix is in the mobile `me` view, not the web. | It is the smallest change that keeps 21j RD-7's one-dialog order whenever a tour will actually take the launch. The web shows its own tour. | 21k release review note 2; run prompt §13 |
| RD-23 | The sheet never opens while a tour runs. | Once the offer is spent, a mid-tour refetch would otherwise present the sheet over the tour. | 21k RD-15 |
| RD-24 | "Overload on iPhone" is significant and internal, and is worded to make sense to a web reader who isn't invited. | It is the beta's announcement (RD-8), not a public launch (RD-14). No `platforms` field is needed (21j RD-6). | 21j RD-6; release-note rules |
| RD-25 | The release note and the `me` change ship in one release PR, merged at the start of the beta, not before. | A note announcing a beta before any invitation is wrong, and the binary doesn't depend on either. | Release-note dating rule |
| RD-26 | OVE-255's confirmation delay is 2,000 ms, with one refetch. | It is longer than the deletion's identity-removal retries (about 750 ms), and a sign-in that is really half-closed is still reported. | OVE-255; `deleteAccount` retries |
| RD-27 | In Production, `staging_protected` is reported as unreachable. | Vercel protection can't legitimately answer Production. Showing the staging access screen to a friend would be wrong. | 21d gate design |
| RD-28 | `expo-dev-client` is not configured for Production. | A store build has no dev launcher. Keeping its plugin there adds nothing. | Expo build model |
| RD-29 | The owner runs the build interactively (`eas build --profile production --auto-submit`). There is no App Store Connect API key or CI pipeline. | Apple sign-in and signing need the owner. This one command also authorizes the build cost. A key is unnecessary for a private beta. | Run prompt §12; rabbit holes |
| RD-30 | The Production public anon key is set in the EAS `production` environment by the run, read from Vercel's Production Config variable in memory, never printed or written to disk. | It is public by design (it ships in the binary), and the build needs it. | Architecture (anon key public, RLS deny-all) |
| RD-31 | Apple sign-in for review: the owner creates a reviewer account through normal signup and adds a small plan on the web. If the owner declines, the review notes say sign-up is open in the app. | Apple asks for a working sign-in. A real signup through every defense is not a fabricated record (RD-12), and no friend's account is exposed. | RD-12; Apple App Review information |
| RD-32 | The run doesn't write a privacy policy. It supplies the data inventory (§8). | A privacy policy is a legal declaration (RD-11), and published terms and privacy pages are owner items (pitch roadmap, Paid-Launch Safeguards). | RD-11; pitch roadmap |
| RD-33 | The runbook and PR follow the two-check acceptance (RD-13). No 21d–21k retest. | Automated suites cover regression. | RD-13 |

## Open Questions

1. **Privacy policy URL** (owner): which URL, or approve a scoped page. It blocks Beta App Review, not the build or Check A.
2. **App Store Connect name** if "Overload" is taken (owner, at record creation).
3. **Reviewer account** (owner): approve RD-31's approach or choose another.
4. **Recipients** (owner).
5. **When to turn on the automatic tour** (owner; proposed after Check B).

## 13. Future considerations

An App Store Connect API key for non-interactive submits. A `platforms` field on release notes if wording stops being enough. Raising `minimumAppVersion` once a later build must replace 1.0.0.
