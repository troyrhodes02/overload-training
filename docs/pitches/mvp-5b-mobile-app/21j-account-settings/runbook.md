# Account & Settings — Runbook

This runbook covers what you do outside the codebase for Pitch 21j:

- check the staging delivery (Stage A: one staging update, no new build);
- confirm the support address;
- create two test accounts;
- run five iPhone checks in one sitting;
- later, approve and install a new development build for the feedback screenshot (Stage B, §5).

Production promotion is **not** part of this runbook. It needs your separate approval after you accept 21j on the iPhone.

**Stage A** needs no migration, no environment change, no native build, and no Stripe change. The runtime fingerprint is unchanged (`f98506f78a`), so the development build already on your iPhone (`86e673d0`) takes the update. **Stage B** (the screenshot) needs a new development build. It waits for you (§5).

## 1. Start from zero

### A. The checkout

```bash
cd ~/Dev/overload-training
git checkout staging
git pull --ff-only origin staging
git status --short --branch     # "## staging...origin/staging" and nothing under it
git log --oneline -1            # the 21j delivery-record commit (§8) or later
```

### B. Servers: none needed

The staging deployment serves the API, and the phone loads the published staging update. If Metro is still running, stop it with Ctrl-C so the phone can't pick up a local bundle.

### C. The iPhone on the staging update

1. Open **Overload Dev**. If it reopens the last project, shake the phone and tap **Go home**.
2. Tap **Enter URL manually** and enter `https://u.expo.dev/3b322e4a-1bf6-422e-9feb-3aa859dffb46?channel-name=staging`.
3. Open More → **Diagnostics** and check these rows:

| Row | Expected |
| --- | --- |
| Environment / API / Supabase project | `staging` / the `overload-training-git-staging-…vercel.app` host / `vdxrmfadikwzodjljbdi` |
| Running | `EAS update` |
| Update group | the group in §8 |
| Commit | the commit in §8 |
| Runtime | `f98506f78a` |

If Diagnostics shows an older group, force-close Overload Dev (swipe it away) and open the URL again.

### D. The staging web app (for the parity checks)

`https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app`

Sign in to Vercel in that browser first (Deployment Protection), then sign in to Overload with the same test account. Never use Production (`www.overloadtraining.app`) for these checks.

## 2. One-time check: the support address

Get help (More → Get help) offers **Email support** only when the server has a support address. That address is `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL`, the same one the web's `/support` page shows. Without it the screen offers only Send feedback, and the web shows a placeholder.

In Vercel → overload-training → Settings → Environment Variables, check that `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL` is set for **Preview** (staging) and **Production** to the address you want lifters to write to. Setting or changing it is your call, and a run never changes it. If you change it for Preview, redeploy staging so the API reads it.

The run's own check of staging's value is in §7.

## 3. The two test accounts (create them on the day you test)

| Account | Profile | Used for |
| --- | --- | --- |
| **Primary** | `standard` (comp Pro) | Scenarios A, B, C, E. |
| **Deletion** | `standard` (comp Pro) | Scenario D only. It is deleted. |

```bash
cd ~/Dev/overload-training
set -a; . apps/web/.env.overload-dev; set +a
# Prints only the project ref. It must read vdxrmfadikwzodjljbdi (overload-dev).
node -e 'console.log("Supabase project:", new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0])'

day=$(date +%m%d)
npm run dev:test-account -- --email "21j-primary-$day@example.com" --profile standard --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email "21j-delete-$day@example.com"  --profile standard --confirm-ref vdxrmfadikwzodjljbdi --execute
```

A good run prints `ENGINE CHECK PASSED`. If it says "expired transaction", nothing was written, so run the same line again.

Passwords stay in owner-only files and are never printed. To copy one to the clipboard (Universal Clipboard pastes it on the iPhone):

```bash
day=$(date +%m%d)
sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/21j-primary-$day@example.com.txt | tr -d '\n' | pbcopy
sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/21j-delete-$day@example.com.txt  | tr -d '\n' | pbcopy
```

**Never use your own account, or the primary account, for scenario D.**

## 4. iPhone acceptance: five scenarios in one sitting

Sign in as the **primary** account for A, B, C, and E, and as the **deletion** account for D.

### Scenario A — Profile, appearance, What's New (primary)

1. Open **More**. Check the grouping: the account card, then Plan, App, Updates & help, Your data, Sign out, and Delete account set apart at the bottom. There is no "Manage account on the web" row.
2. Tap the account card to open **Profile**. **Save** is dimmed. Change the first name and the dimming goes away.
   - Swipe back without saving: "Discard your changes?" appears. Choose **Keep editing**.
   - Tap **Save**. "Saved" appears, and the account card and Today's greeting use the new name.
3. Clear the first name and tap Save: "Enter your first name." appears and nothing is sent. Put the name back.
4. Tap **Time zone**. Search "london" and pick **Europe/London**. Profile shows it unsaved; Save, then change it back to your zone and save again. If the phone's zone differs from the account's, the list offers **This iPhone: …** first.
5. On the staging web app, Settings shows the new name. Change the last name on the web, then pull to refresh More on the phone: it shows.
6. **Appearance:** choose Light, then Dark, then System. Every 21j screen stays readable in each: Profile, Plan & access, What's New, Get help, Send feedback, Export, Delete account. Switch iOS itself between light and dark while on System, and the app follows.
7. **What's New:** the list matches the web's What's New page (Settings → What's New), with the same entries, order, and dates. Opening it shows no badges and marks nothing.
8. **Launch sheet:** a new account starts with nothing unseen, so the sheet won't open on its own. That is the no-backlog rule, and it is tested in the suites (§6). Confirm only that no "What's new" sheet appears at launch.

### Scenario B — Feedback and help (primary)

1. More → **Send feedback**. **Send** is dimmed until you choose a category and type a message.
2. Choose **Bug**, type "21j acceptance — feedback from the iPhone", and tap **Send** twice quickly. One "Thanks — sent to the owner." appears.
3. On the staging web app, open `/admin/feedback` signed in as your admin account. The message appears **once**.
4. Turn on Airplane Mode, open Send feedback again, type something, and tap Send. You see "Couldn't send. Your message is still here." Turn Airplane Mode off and tap Send: it goes once.
5. Open Send feedback, type a few words, then tap **Cancel**: "Discard this feedback?" appears. Discard.
6. More → **Get help**. Send feedback opens the form with **Question** chosen. Close it. If the support address is set (§2), **Email support** opens Mail addressed to it. Otherwise only Send feedback is shown.
7. **Screenshot:** not in this update. The Screenshot row appears after the Stage B build (§5).

### Scenario C — Plan, access, and export (primary)

1. More → **Plan**. It reads "Pro — complimentary" with "You have complimentary Pro. There's nothing to pay or cancel.", "Included in your plan" lines, and "Free always includes". There is no price, no button, and no link. The sentence reads "Plans and billing are managed on the Overload website."
2. More → **Export your data** → **Export**. The share sheet opens with `overload-export-<today>.json`.
3. Choose **Save to Files** → On My iPhone → Save. Open it in Files: it is JSON, and it lists your profile and logged sets.
4. Export again and **dismiss** the share sheet. Nothing breaks, and no message appears.
5. Optional: download the export on the staging web app (Settings → Export). It matches the phone's file for the same day.

### Scenario D — Delete account (the deletion account)

1. Sign out, then sign in as `21j-delete-<day>@example.com`.
2. More → **Delete account**. Check the screen:
   - your counts (plans, workouts, sets);
   - "The shared exercise library isn't affected.";
   - the billing note;
   - Contact support, and Before you go, you can export your data;
   - the password field. **Delete account permanently** is dimmed until you type.
3. Type the password and tap **Delete account permanently**. The alert "Delete your Overload account?" appears. Tap **Cancel**: nothing happens, and the account is intact.
4. Type a wrong password and confirm: "That password isn't right." appears, and the field clears.
5. Type the right password, tap **Delete account permanently**, then **Delete**. "Deleting…" shows, then Welcome with "Your account was deleted."
6. Try to sign in with that account: it's refused.
7. Run `npm run dev:test-account -- --email "21j-delete-$day@example.com" --profile standard --confirm-ref vdxrmfadikwzodjljbdi`. **Leave off `--execute`**: without it, this is a dry run that only reads. It prints `account: would be created`, which means the sign-in no longer exists. The isolation and deletion suites prove which rows go (§6).
8. **Paid-subscription deletion (optional, Stripe test mode only):** on the staging web app, subscribe a third fresh account with Stripe's test card `4242 4242 4242 4242`. Delete it from the phone, then check in the Stripe **test** dashboard that its subscription is **canceled**. Never use a live card or a Production account.

### Scenario E — Final regression (primary)

1. Sign in as the primary account.
2. **Today** shows today's workout with the greeting. Start it, log one set, and finish it.
3. **History** shows the workout. **Goals** opens.
4. Sign out and sign back in.

Tell me the result of each scenario: passed, or what you saw.

## 5. Stage B: the feedback screenshot (a new development build — needs your approval)

The screenshot row (OVE-252, PR #325, a **draft**) adds two native modules: `expo-image-picker` and `expo-image-manipulator`. A staging update can't add native code, so this needs a new development build. The new runtime is `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`.

**Why the PR is held.** Once it is in `staging`, every staging update targets the new runtime, and your current build (`86e673d0`) stops receiving updates. Install the new build first.

When you approve, the steps are:

1. **Build.** This is a run of EAS's iOS development profile, on your account's EAS credits. It takes about 15 to 25 minutes.

   ```bash
   cd ~/Dev/overload-training
   git fetch origin && git checkout feat/ove-252-21j-feedback-screenshot && git pull --ff-only
   npm ci
   cd apps/mobile
   npx --yes eas-cli build --profile development --platform ios
   ```

   It uses the same Apple signing as `86e673d0`. If EAS asks to register the device again, it is the same iPhone.
2. **Install** the build on the iPhone from the link EAS prints, the same way as before.
3. **Tell me it's installed.** I then merge PR #325 into `staging` and publish one staging update for the new runtime.
4. **Check B (screenshot):**
   - More → Send feedback → **Add a screenshot**. The system photo picker opens with **no permission prompt** and no camera option.
   - Pick a screenshot. A thumbnail appears with Replace and Remove. Tap the thumbnail to review it full screen, then try Replace and Remove.
   - Send. In `/admin/feedback` the message shows the image.
   - Save the image from the admin view to a Mac and run `mdls -name kMDItemLatitude <file>`. It prints `(null)`: no location.

Until then, feedback sends text only. That is the whole of Stage A.

## 6. What the automated suites cover (no extra accounts needed)

| Area | Where |
| --- | --- |
| Every new endpoint: no token, a bad token, suspended, an old app version, another account's data | `apps/web/tests/integration/isolation/mobile-api.int.test.ts` |
| Profile rules, "taken", the plan view with no purchase field, the release-note seen point (forward-only), no backlog for a new account, the export equal to the web's | `apps/web/tests/integration/mobile-account-settings.int.test.ts` |
| Deletion outcomes, with two accounts: wrong password; rate-limited; Free; an active subscription canceled **before** any delete; a cancel failure (nothing deleted); Stripe not configured; trial and comp; identity pending and retry; 401 after deletion; the token's email only; nothing logged | `apps/web/tests/integration/mobile-account-deletion.int.test.ts` |
| Feedback: a replay makes one row and one upload; key reuse is 409; bytes are checked; the size and daily limit apply; nothing is uploaded on refusal | `apps/web/tests/integration/mobile-feedback.int.test.ts`, `apps/web/tests/unit/screenshot-sniff.test.ts` |
| The iPhone screens and models: More, Profile, Plan, What's New and its sheet, Help, Feedback, the export file lifecycle, every deletion outcome, Check again, cleanup | `apps/mobile/tests/account-settings.test.tsx`, `apps/mobile/tests/export-delete.test.tsx` |
| The runtime stays `f98506f78a` (the declared `expo-file-system` range) | `apps/mobile/tests/fingerprint-inputs.test.ts` |

## 7. Verification record

Run of 2026-11-24, on `staging` at `370ca69` (#320–#324 plus the review fixes in #326):

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` (0 errors; the one `_last` warning was already there), `prettier --check` | pass |
| Web unit (`npm test -w @overload/web`) | 2,780 passed |
| Mobile (`npx jest` in `apps/mobile`, run alone) | 597 passed (606 on the held OVE-252 branch) |
| Full integration (`npm run test:integration`, 115 suites) | 1,670 passed |
| `npm run build` (placeholder env) | pass |
| Runtime fingerprint on `staging` | `f98506f78acfef2f8bfc764d2e31f16475e2f501`, unchanged, so build `86e673d0` takes the update |
| Independent review of #320–#324 | 1 confirmed and 5 lower findings, all fixed (spec RD-26; #326, and #325 for the picker) |
| **Staging API checks** against the deployed staging API, with disposable accounts `21j-verify-1124@example.com` and `21j-verify-1124b@example.com`, both deleted by the checks | **19/19 passed, twice** (before and after #326). Covered: profile round trip and the per-field 400; read-only plan; release notes and the seen mark; complete export; feedback 201 then replayed, 409 on a reused key, 400 without one; inventory; a wrong password gives 400 and nothing is deleted; delete gives `deleted`; then `/me` is 401, a retry is 401, and sign-in is refused |
| Export size | a 32-workout, 264-set account is **149 KB** on the wire (compact) and **188 KB** as the saved file. That is about 565 bytes per logged set on the wire and 713 in the file. Vercel's 4.5 MB response limit allows about 8,000 sets on the phone and about 6,300 for the web's pretty-printed download, roughly 4 to 5 years at 4 workouts a week. Spec Open Question 1 |
| Staging `app-config.supportEmail` | `null`: `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL` is set for **Production only**, not Preview. On staging, Get help shows Send feedback only (§2) |

**Not verified by the run** (needs the iPhone, §4): the look of every screen in light and dark, the share sheet and Save to Files, Mail opening, the What's New sheet presentation, the keyboard on Profile, Feedback, and Delete, VoiceOver and the largest text size, and the deletion flow and Welcome notice on the device. The screenshot picker needs the Stage B build (§5).

## 8. Delivery record

(Filled in by the run; see below.)
