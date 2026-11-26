# TestFlight Beta — Runbook

What the owner does outside the codebase, one gate at a time. Each gate says what's needed, why, the exact action, what to send back, and what happens next. Engineering detail is in `spec.md`.

**Where things stand** is §10. It is updated at every gate.

---

## 1. What the run already did (no action)

- OVE-255, the What's New fix, the Production environment and app identity, and About this app are built, reviewed, and on staging.
- The staging fingerprint is unchanged (`2e4a65d9…`). Your development build `c22ac9a0` keeps receiving staging updates.
- The EAS `production` environment holds `EXPO_PUBLIC_OVERLOAD_ENV=production` and the Production public anon key (its project ref was checked; the value was never printed).
- Production's mobile API already serves everything the app calls (`main` and `staging` differed only in docs before this pitch).

## 2. Gate 1: approve release A (Production web)

**What and why.** Release A carries OVE-255, the `me` change, and the Production app profile to `main`. The TestFlight app is built from `main`, so this merges first. It has no migration and no environment change. The release note is **not** in it (that is release B, §5).

**Action.** Review and merge the release PR (link in §10). Then tell the run "release A merged".

**Next.** The run checks the Production deployment, syncs `main` into `staging`, and hands you Gate 2.

**Done (2026-11-26).** Approved by the owner. #349 merged as `ee38aa4`, after the release review's should-fix (#351) was added. Production deployment `dpl_3AFTMG8NZ5z8rC5nUjLs9spQq5gd` is Ready. Synced into staging by #352.

## 3. Gate 2: build and upload (one command, your Apple sign-in)

**Why you.** It needs your Apple ID sign-in and two-factor code, which a run can't do. Running it is also your approval of one EAS build.

**Action.** In your own terminal (not through Claude):

```sh
cd ~/Dev/overload-training
git switch main && git pull --ff-only
cd apps/mobile
npx eas-cli build --platform ios --profile production --auto-submit
cd ~/Dev/overload-training && git switch staging
```

Answer the prompts like this:

| Prompt | Answer |
| --- | --- |
| Log in to your Apple account? | Yes. Use your Apple Developer account and the 2FA code |
| Team | your existing team (the one the development build uses) |
| Register bundle identifier `app.overloadtraining`? | Yes |
| Generate a distribution certificate / provisioning profile? | Yes (let EAS manage them) |
| Remote build numbers not set up / initialize? | Yes, accept the suggested value |
| App Store Connect API key for submissions? | Yes, let EAS create one (it makes later uploads non-interactive) |
| Create the app in App Store Connect? | Yes. Name: **Overload** (if Apple says it's taken: **Overload Training**). Language: English (U.S.). SKU: `overload-ios` |

The build takes about 15–25 minutes, then the upload. Apple then processes the build, usually 5–30 minutes. Apple emails you when it's ready.

**Send back:** "build done", plus the build number App Store Connect shows (TestFlight → iOS builds) and the App Store Connect app name you used. If anything failed, paste the last lines of the output.

**Next.** The run records the build, the runtime, and the App Store Connect app id in this runbook and `eas.json`.

## 4. Gate 3: Check A, your own smoke test (internal TestFlight)

**Why.** Internal testing needs no Apple review, and it proves the real signed build works before anyone else gets it.

**Action.**

1. In App Store Connect → your app → TestFlight → **Internal Testing**, create a group (for example "Owner"), add yourself, and add the build. Answer export compliance if asked: the app uses **no** non-exempt encryption (it's already declared in the build, so the question may not appear).
2. On your iPhone, install **TestFlight** from the App Store and install **Overload** (it sits beside "Overload Dev"; they don't affect each other).
3. Open Overload. On Welcome there is no "Staging" badge.
4. Sign in with your own account.
5. More → scroll to the bottom → **About this app**. Check:
   - Environment **Production**;
   - Server **www.overloadtraining.app**;
   - Sign-in project **ycxvdiklpefyhdclxyau**;
   - Version **1.0.0** and the build number from Gate 2;
   - Channel **production**.
6. Today shows your real day. Plan and History show your real data. Move between the tabs.

Don't log a workout for this check unless you're actually training.

**Pass:** the build opens, signs in to Production, and shows your real account.

**Send back:** "Check A passed" (or what was wrong, with a screenshot of About this app).

## 5. Gate 4: Beta App Review (Apple), and what only you can decide

Four things are needed before the first external build can go to Apple. Send them together when you're ready.

1. **A privacy policy URL.** Apple requires one for every app, and Overload has none published. Choose one:
   - a URL you already have; or
   - approve a scoped `/privacy` page (a separate small pitch; you approve its words).

   The facts it must cover are in `spec.md` §8 (what the app stores, where it goes, and no tracking). This is your legal statement, so the run won't write it for you.
2. **Reviewer sign-in.** Apple's reviewers need an account that works. Recommended: you sign up a new account yourself (for example `review+overload@` an address you control), then build a two-day plan on the website. It needs no fake history. Send back the email and password through App Store Connect only (step 3 below), never in chat.
3. **Test information** in App Store Connect → TestFlight → Test Information. Paste:
   - **Beta App Description:** Overload is a strength training tracker. You build your own training plan on the website, and Overload tells you, lift by lift and session by session, whether to add weight, hold, or deload, based on what you logged. This iPhone app uses the same account and data as the website: follow today's workout, log your sets, see this week's schedule, and check your history, goals, exercises, and gyms.
   - **What to Test:** Sign in with your Overload account. Open Today, start your next planned workout, log your sets, and finish it. Then check it appears in History, here and on the website. Tell us anything confusing, slow, or wrong: More → Send feedback in the app, or a screenshot in TestFlight.
   - **Feedback email:** support@overloadtraining.app
   - **Marketing URL** (if asked): https://www.overloadtraining.app
   - **Privacy Policy URL:** from item 1.
   - **Beta App Review Information:** your name, email, and phone; **Sign-in required: yes**, with the reviewer account from item 2.
   - **Review notes:** Overload is a strength training tracker. Accounts are free, and sign-up is open in the app and on the website. Training plans are built on the website (www.overloadtraining.app); the app follows and logs them. The demo account has a small plan, so you can start and log a workout from Today. Plan & access is read-only: the app sells nothing.
4. **Submit.** TestFlight → **External Testing** → create a group named **Friends**, with **no public link**. Add the build. App Store Connect asks to submit it for Beta App Review: confirm.

**Apple decides.** A first review often takes about a day. If Apple rejects it, paste the exact reason; the run fixes only what it names.

**Send back:** "submitted", and later Apple's answer.

## 6. Gate 5: start the beta (release B, recipients, invitations)

Only after Check A passes **and** Apple approves the build.

1. **Release B.** The run opens a release PR with only "Overload on iPhone", re-dated to that day. Merge it, so the note appears on the web and the phone as the beta starts.
2. **Recipients.** Tell the run the friends' first names only. Invite one friend first: in App Store Connect → TestFlight → **Friends** → Testers → add by email. Their email stays in App Store Connect, not in this repository.
3. **Your message to them** (Apple's email comes separately):

   > Overload is on iPhone now, as a private beta. Install Apple's TestFlight app, then open the invitation email from Apple and tap "View in TestFlight" to install Overload. Sign in with your usual Overload account. Your training data is the same as on the website, because it's real and it's yours. Next time you train, log your workout in the app and let me know it shows on the website too. Found a problem? More → Send feedback (you can attach a screenshot), or take a screenshot in TestFlight.

## 7. Gate 6: Check B, one friend's real workout

**Pass:** one friend tells you they:

1. installed Overload from TestFlight;
2. signed in with their own account;
3. logged their next real workout and finished it;
4. saw it in History on the phone;
5. saw it on the website.

Their word is the evidence. Don't ask for their password, don't look at their data in admin, and don't log anything for them.

**Send back:** "Check B passed" and the date. The run then closes out 21l (OVE-264).

## 8. The automatic first-login tour (your decision; proposed after Check B)

- **Who would see it:** only accounts that never saw a tour on either client: new sign-ups and accounts made on the phone. Friends who used the web won't. Nobody's stored tour outcome changes.
- **Switch on:** Vercel → overload-training → Settings → Environment Variables → add `MOBILE_TOUR_AUTO_START` = `true` for **Production** only, then redeploy. No app build or update.
- **Check:** `https://www.overloadtraining.app/api/mobile/v1/app-config` shows `"tourAutoStart": true`.
- **Switch off:** remove the variable (or set it to anything else) and redeploy.
- While it is on, a due account sees the tour offer on Today first and What's New after it. While it is off, What's New shows normally (21l RD-22).

## 9. Operating the beta

**Feedback.**
- More → Send feedback (with an optional screenshot) lands in your admin feedback inbox on Production.
- Email goes to support@overloadtraining.app.
- TestFlight screenshots and comments are in App Store Connect → TestFlight → Feedback.

**Triage.**

| Class | Example | Action |
| --- | --- | --- |
| Critical | data shown to the wrong account, a set lost or changed | Pause at once (below), then fix through staging and a release |
| Blocker | can't sign in, can't log, a crash on launch | Stop new invitations; fix; replacement build or update |
| Important | confusing wording, a slow screen | Next build |
| Minor | polish | Backlog |

**Fixing.**
- Reproduce on staging with a dev test account (`npm run dev:test-account`), fix in a PR to `staging`, and check it on your development build.
- **Backend fix:** the normal release PR to `main` (promotion workflow). Installed apps pick it up immediately.
- **App fix, JavaScript only, same runtime:** after its release to `main`, run from the repository root, on a clean `main`:

  ```sh
  npm run mobile:update:production -- --message "What it fixes"
  ```

  It refuses anything not on `origin/main`, any channel but `production`, and a runtime no Production build has. Phones get it on their next launch.
- **App fix with native changes** (a new package, an app config change): a new build, the Gate 2 command again. The build number goes up by itself. Add the build to the Friends group. A later build of 1.0.0 may skip Apple's full review, but don't count on it.

**Pause and rollback.**
- **Stop new invitations:** don't add testers. Remove one in Friends → Testers.
- **Stop a build:** TestFlight → the build → **Expire Build**. Nobody can install it after that. Apple's help page doesn't say what happens to copies already installed, so ship a replacement first if people still need the app.
- **Backend incident:** Vercel → Deployments → promote the previous Production deployment, then fix forward.
- **Automatic tour:** §8, switch off.
- Native code already installed can't be rolled back instantly. A newer build or a compatible update replaces it. Nobody's training data is ever touched by any of these steps.

**Builds expire after 90 days** in TestFlight. Make a new build before then.

## 10. Status

| State | Status |
| --- | --- |
| 1. Engineering complete | **Yes** (2026-11-26). Staging `845a486` (#347: #345, #346) and the release note `44817b5` (#348) |
| 2. Production-ready (release A merged) | **Yes** (2026-11-26). `main` `ee38aa4` (#349), deployment `dpl_3AFTMG8NZ5z8rC5nUjLs9spQq5gd` Ready, synced by #352 |
| 3. TestFlight build created | **Waiting for Gate 2** (§3) |
| 4. Uploaded and processed | No |
| 5. External review approved | No |
| 6. Private invitations sent | No |
| 7. Existing-user workout accepted | No |
| 8. Milestone complete | No |

**Delivery record (2026-11-26).**

| | |
| --- | --- |
| Staging | `845a486` (#347), then `44817b5` (#348, the note; staging only until release B) |
| Release A | PR #349, merged as `main` `ee38aa4`. Its tree equals staging `845a486` plus `805e27f` (#351, the release-review fix) plus its record. It does not carry the note |
| Production deployment | `dpl_3AFTMG8NZ5z8rC5nUjLs9spQq5gd` from `ee38aa4`, Ready. Live checks: `app-config` 200 with `tourAutoStart: false` and `minimumAppVersion` `0.0.0`; `/me` 401 `unauthorized` with no token or a bad one; a missing or malformed version header gets 400; the apex 308s to www |
| Sync | #352 (merge commit `8bcc4f1`). `main` is an ancestor of `staging` |
| Staging update (latest) | group `3cbb7ae0-3b28-4989-ad11-8ad54d1066a5`, iOS update `01a2193c-1bee-7b27-8d13-7a4909d54bc5`, commit `8bcc4f1`, runtime `2e4a65d9…`, build `c22ac9a0` (carries #351) |
| Staging update (earlier) | group `b615c92c-89bc-4ccf-b34f-bc2b4c17b038`, iOS update `01a218d5-bea7-7743-beac-ed00fdbf169f`, commit `44817b5`, runtime `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`, build `c22ac9a0`. Optional: open it on your development build to see OVE-255 and About this app (it says Staging) |
| Production runtime (expected) | `920ec3f2fadf247795ba7876b975db0d35706fec`, measured locally at `ee38aa4`; the EAS build reports the real one. The earlier `e8a58a87…` came from a malformed local command |
| EAS `production` environment | `EXPO_PUBLIC_OVERLOAD_ENV`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (ref `ycxvdiklpefyhdclxyau` checked) |
| Checks (release branch) | lint, typecheck, format; unit: web 2,785, mobile 781; integration 1,696 (isolation included); web build and bundle scan; `eas config --profile production` evaluates as Overload / `app.overloadtraining` / 1.0.0 / channel `production`; release-diff review: nothing blocking, one should-fix fixed (#351) |

**Configuration matrix:** design.md §3.

**Apple setup record** (filled in as gates pass):

| | |
| --- | --- |
| Apple team | the existing team (EAS-managed); recorded at Gate 2 |
| Bundle id | `app.overloadtraining` (registered at Gate 2) |
| App Store Connect app | name and app id recorded at Gate 2 |
| Export compliance | `ITSAppUsesNonExemptEncryption = NO` in the build |
| Privacy policy URL | Gate 4 item 1 |
| Internal group | Gate 3 |
| External group | "Friends", no public link (Gate 4) |

**Build record** (filled in at Gate 2): EAS build id, source commit, version `1.0.0`, build number, bundle id `app.overloadtraining`, runtime, channel `production`, environment Production.

**Invitation record:** count of invited friends and dates only, never names or emails.

**Known limitations.** No purchases in the app (Plan & access is read-only). No offline logging. iPhone only. Turnstile in the Production sign-up screen is unverified on a device (friends sign in rather than sign up).
