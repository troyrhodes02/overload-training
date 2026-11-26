# Native Tour — Runbook

This runbook covers what you do outside the codebase for Pitch 21k:

- load the one staging update on your iPhone (no new build);
- run **two** short iPhone checks on one existing account;
- later, in 21l, turn on the automatic first-login tour (§6).

Production promotion is **not** part of this runbook. It needs your separate approval after you accept 21k on the iPhone.

21k needs no migration, no environment change, no native build, and no Stripe change. The runtime fingerprint is unchanged (`2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`), so the development build already on your iPhone (`c22ac9a0`) takes the update.

## 1. Load the staging update

1. Stop Metro if it is running (Ctrl-C), so the phone can't pick up a local bundle.
2. Open **Overload Dev**. If it reopens the last project, shake the phone and tap **Go home**.
3. Tap **Enter URL manually** and enter `https://u.expo.dev/3b322e4a-1bf6-422e-9feb-3aa859dffb46?channel-name=staging`.
4. Open More → **Diagnostics** and check:

| Row | Expected |
| --- | --- |
| Environment / Supabase project | `staging` / `vdxrmfadikwzodjljbdi` |
| Running | `EAS update` |
| Update group | the group in §5 |
| Commit | the commit in §5 |
| Runtime | `2e4a65d9cd…` |

If Diagnostics shows an older group, force-close Overload Dev (swipe it away) and open the URL again.

## 2. The account: one you already have

Use **`21i-combined@example.com`** on staging. It has a plan, history, goals, and gyms, so every step has something real under its highlight. Copy its password to the clipboard without showing it:

```bash
sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/21i-combined@example.com.txt | tr -d '\n' | pbcopy
```

Sign in with it if the app isn't already signed in to it. No new account is needed, and nothing in it changes (the tour writes only its own "finished" or "skipped" record).

## 3. The two iPhone checks

### Test 1: complete the tour

1. Open **More**.
2. In **Updates & help**, tap **Take a tour**.
3. The intro card says the tour is short, changes nothing in your training, and can be skipped. Tap **Start tour**.
4. Tap **Next** through the steps. On each, check that the ring sits on the right thing and the text is readable:
   - Today: the **Today** title, then the **Start workout** or **Resume workout** button, or the day's card if there is no workout today;
   - Getting around: a card above the tab bar, with no ring;
   - Plan, History, and Goals: each screen's title;
   - More: the **Exercises** row, the **Gyms** row, then **Take a tour**.
5. On the last step tap **Done**.

**Pass:** the tour runs, finishes on More, and the app works normally afterwards (tabs, scrolling, rows all respond).

### Test 2: skip and replay

1. Tap **Take a tour** again, then **Start tour**.
2. Tap **Next** once or twice.
3. Tap **Skip tour**.
4. The overlay is gone, you're on More, and the tabs work.
5. Tap **Take a tour** again: the intro card appears. Tap **Not now**.

**Pass:** skipping works, the tour can be opened again, and no overlay is left blocking touches.

Nothing else needs a new round on the phone. Today, the workout, scheduling, History, Goals, Plan, Exercises, Gyms, and the 21j settings are unchanged apart from the new row and invisible anchors, and the automated suite covers them.

**If something is off**, note the step and what the ring pointed at (a screenshot helps), and tell me. A fix is one more staging update on the same build.

## 4. What the run checked for you (no action)

The automated suite covers the detail behind the two checks:

- every step on the real router;
- steps that can't be found: no plan, Today failing to load, an anchor that never measures, one that appears late, one off screen, and a tab with a form left open, which is never popped;
- backgrounding, a navigation the tour didn't make, unmounting, and repeated taps;
- that the tour sends nothing but its own record;
- VoiceOver labels and focus, escape, Reduce Motion, and large text;
- the two new endpoints, including the cross-account isolation suite.

Section 5 lists the results.

**Not verifiable by a run:** how the overlay looks and feels on the device, that the Modal covers the native tab bar, real measurements, and VoiceOver and Dynamic Type on hardware. Your two checks cover the first three. An optional extra, if you have a minute: turn on VoiceOver and listen to one card ("Logging a workout, step 2 of 9…").

## 5. Delivery record

Delivered 2026-11-25:

| Item | Value |
| --- | --- |
| Staging commit | `04799cd` (feature PR #335: tickets #336–#339, review fixes #340) |
| Update group | `ad04a02b-95e3-4203-90d3-c8df40c2ebc3` |
| iOS update id | `01a215e7-4dbe-756c-b28f-45b2299097f3` |
| Runtime | `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c` (unchanged) |
| Compatible build | `c22ac9a0` (already on your iPhone) |

**Run's checks on the merged code.**

| Check | Result |
| --- | --- |
| Web unit | 2,784 passed |
| Integration (including the isolation suite) | 1,690 passed, 116 suites |
| Mobile | 719 passed, 58 suites |
| Format, lint, typecheck | Clean. One lint warning is older, in a file 21k doesn't touch. |
| Builds and scans | The web build passes and its client-bundle scan finds no secret. The iOS export passes and the bundle contains no server secret. |

**Staging API checks (2026-11-25).**

- `app-config` returns `tourAutoStart: false`.
- Both tour endpoints answer 401 without a token, and a GET answers 405.
- With `21i-verify@example.com`:
  - `PUT /me/tour/outcome` returns 200 `{outcome}`, a repeat returns 200, and an unknown outcome returns 400;
  - `POST /me/tour/offered` returns 200;
  - `me.tour.autoStart` then reads false.
- `21i-combined@example.com` signs in (read-only check).

## 6. 21l handoff (not part of 21k acceptance)

**Turning on the first-login tour.** The app starts the tour by itself only when `GET /api/mobile/v1/app-config` says `tourAutoStart: true`. That happens only when the server's `MOBILE_TOUR_AUTO_START` is exactly `true`. It is unset everywhere today, so nobody sees the tour automatically, including on staging and on any update.

When the beta starts (21l):

1. In Vercel → overload-training → Settings → Environment Variables, add `MOBILE_TOUR_AUTO_START` = `true` for **Production** (and Preview, if you want testers on staging to see it). Redeploy so the API reads it. No new app build or update is needed.
2. **Who sees it:** only accounts that are *due* the tour, meaning never shown a tour on either client.
   - New signups since Pitch 11 are due.
   - So are staging accounts made with `npm run dev:test-account`. The 21k staging check found `21i-combined@example.com` due. Turning the flag on for Preview would tour those test accounts once.
   - Friends who already used the web have seen the web tour, so they won't see it again on the phone.
   - A new account made on the phone sees it once, on Today, the first time it opens there.
3. **Verify in the beta:** make one new account on the TestFlight build. It should show "Take a quick tour" on Today once, and never again after Not now, Skip, or Done. An existing friend's account should open straight to Today with no tour.
4. **To switch it off**, remove the variable (or set it to anything but `true`) and redeploy. No build needed.

**Also for 21l:**

- The What's New entry "Overload on iPhone" (21j RD-6) is written in 21l, not 21k.
- **OVE-255** (Delete account "Check again" wording and a mid-deletion notice) is still open in Backlog. Fix it before the TestFlight build.
- Known caveats to check on the TestFlight device:
  - The tab bar is not highlighted itself, by design. Each tab's step highlights the screen that tab opens.
  - If a step's control is below the fold, the tour scrolls it into view first.
  - If the Modal ever fails to cover the tab bar on a future iOS, the fallback is a root-level overlay (spec §16).
- A due account on the phone sees no What's New sheet until the tour has been offered (21j RD-7). This resolves itself once the flag is on.

## 7. Closeout: owner acceptance, Production release, and sync (2026-11-26)

**Status: released to Production. 21k is complete. Pitch 21l (TestFlight Beta) can begin.**

### Owner acceptance on the iPhone

Both checks in §3 passed on staging update `ad04a02b-95e3-4203-90d3-c8df40c2ebc3` (iOS update `01a215e7-4dbe-756c-b28f-45b2299097f3`, commit `04799cd`, runtime `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`, development build `c22ac9a0`):

1. **Complete the tour: PASSED.**
   - Take a tour, the intro card, and Start tour all worked.
   - All nine steps showed their rings on the right controls, with readable text.
   - Done returned to normal navigation, with no overlay left.
2. **Skip and replay: PASSED.**
   - A replay, a few steps, then Skip tour returned to normal navigation.
   - Take a tour again, then Not now, left no overlay and no blocked control.

No further 21k iPhone acceptance is needed.

### Production release

| | |
| --- | --- |
| Release branch | `release/21k-native-tour`, from `main` at `1826803`. Three cherry-picks (#334, #335, #341), plus the release record. Apart from the record, its tree equalled `staging` at `181dd28` |
| Release PR | #342, squash-merged as **`4aacae7`** after the Vercel checks passed |
| Verification | Format, lint (0 errors), and typecheck pass. Web unit 2,784 and mobile 719 pass, as do 1,690 integration tests in 116 suites. The Production build and its client-bundle scan pass, the iOS export holds no secret, and the release diff is clean. Fingerprint `2e4a65d9…` |
| Independent review | Release-ready, no blocking finding |
| Production deployment | `dpl_9XfRoEUzkyf6mG5NkEvgef17YFPq`, Ready, on `www.overloadtraining.app` |
| Smoke checks | Public pages 200. `app-config` shows **`tourAutoStart: false`**, minimum `0.0.0`. Both tour endpoints and `GET /today` answer 401 without a token, and GET on the tour paths answers 405. The version gate holds. The log check is inconclusive |
| Migration and environment | None. No `MOBILE_*` variable on Production or Preview |

The full record is `docs/releases/2026-11-21k-native-tour-production.md`.

### Synchronization

- #343 merged `main` into `staging` with a merge commit (`2e73f6b`).
- `main` is an ancestor of `staging`, and the two trees were equal.
- The staging deployment succeeded and answers `tourAutoStart: false`.
- The app code on `staging` is unchanged since `04799cd`, so staging update `ad04a02b` stays current. No new update was published.

### Native distribution

- The accepted iPhone app stays on the `staging` channel. Development build `c22ac9a0` still carries the runtime.
- No Production Expo update, no Production-connected build, and no TestFlight or App Store submission was made. They belong to Pitch 21l.
- **Automatic onboarding is off.** `MOBILE_TOUR_AUTO_START` is unset everywhere, so `tourAutoStart` is false on Production and staging. Section 6 is the 21l plan.

### Handed to 21l

- **Turning on automatic onboarding** (§6). Existing web tour outcomes stay authoritative and are never reset.
- **"Overload on iPhone"**, the first native What's New entry.
- **OVE-255** (Backlog). Delete account's "Check again" wording and the mid-deletion notice. Fix before TestFlight.
- **What's New while the gate is off.** `GET /me` holds back What's New while an account is still due its tour (21j RD-7).
  - A due account sees no What's New sheet on the phone until it finishes or skips a tour. "Not now" records nothing, so it doesn't count.
  - This resolves itself once the gate is on.
- **21l's other work:**
  - final iPhone polish;
  - the Production-connected build and App Store Connect;
  - the first external TestFlight review;
  - beta invitations.
