# TestFlight Beta — Design Document

**Pitch:** `pitch.md` in this folder (21l).
**Client scope:** native iOS, plus one additive change in the mobile `me` view and one release note the web also shows.
**UI preview:** Skipped, because this is a mobile-only pitch. The native visual contract is §12 (Mobile design), built with `/overload-mobile-ui`. The visual review artifact is the design canvas linked from §12.

---

## 1. Vision

The app the friends install is the app the owner already accepted, pointed at Production, with its identity visible on demand. Nothing about it is new to them except that it runs on their phone. Every part of the release can be paused or replaced without touching anyone's training history.

## 2. Design principles

1. **Two environments, never mixed.** Staging and Production are separate apps with separate identities, channels, and keys. Each refuses the other's values.
2. **Say which one this is.** The owner reads the environment from a screen, not from the app's appearance.
3. **Change nothing the owner accepted.** Fixes are limited to what is wrong in Production or named by OVE-255.
4. **Reversible.** Every rollout control has a written off switch.

## 3. Build architecture

| | Staging (development) | Production (TestFlight) |
| --- | --- | --- |
| EAS build profile | `development`, `development-simulator` | `production` |
| Distribution | internal (registered devices) | store (App Store Connect, TestFlight only) |
| EAS environment | `development` | `production` |
| `EXPO_PUBLIC_OVERLOAD_ENV` | `staging` | `production` |
| API | `https://overload-training-git-staging-…vercel.app` | `https://www.overloadtraining.app` |
| Supabase project | `vdxrmfadikwzodjljbdi` (overload-dev) | `ycxvdiklpefyhdclxyau` (Production) |
| Local API override | Metro development bundles only | never |
| Staging access key | yes (Keychain, per device) | never |
| Update channel | `staging` | `production` |
| Display name | Overload Dev | Overload |
| Bundle identifier | `app.overloadtraining.dev` | `app.overloadtraining` |
| Scheme | `overload-dev` | `overload` |
| Version / build | 0.1.0 / 1 (unchanged) | 1.0.0 / EAS remote, auto-incremented |
| Dev launcher | yes | no |
| Local-network ATS exception | yes | no |
| Diagnostics | yes | no |
| About this app | yes | yes |
| Runtime | `2e4a65d9cd…` (unchanged) | its own fingerprint |

Separate bundle identifiers let the owner keep the staging development build and the TestFlight app side by side on one iPhone.

**Fingerprint rule.** The staging runtime is a hash of the evaluated staging config and of every file the config loads. The staging config's output and its two imported files (`environment.ts`, `tokens.ts`) stay byte-for-byte as they are. The Production allowlist lives in a new shared module that the config loads only when it evaluates a Production target, so the staging fingerprint never sees it.

## 4. App identity

- **Name on the Home Screen:** Overload.
- **App Store Connect name:** "Overload" if available. If Apple says the name is taken, the owner picks a variant such as "Overload Training". The Home Screen name stays "Overload" either way.
- **Icon and launch screen:** the accepted ones (`assets/icon.png`, `assets/splash-icon.png` on the token backgrounds). No redesign.
- **Minimum iOS:** Expo SDK 58's default deployment target. No override.
- **iPhone only** (`supportsTablet: false`, as accepted).

## 5. Apple signing and App Store Connect

- EAS manages the distribution certificate and provisioning profile on the existing Apple team, as it already does for the development profile.
- The owner signs in to Apple once, interactively, in the build-and-submit command. A run cannot sign in to Apple.
- `eas submit` creates the App Store Connect app record if it doesn't exist and uploads the build.
- **Export compliance** is answered in the binary (`ITSAppUsesNonExemptEncryption = NO`, set since 21d). The app uses only the operating system's HTTPS and Keychain, and no custom encryption. The owner confirms this in App Store Connect as the account holder.

## 6. TestFlight review and testers

- **Internal testing first.** The owner is an App Store Connect user, so they can install the build from TestFlight as soon as it's processed. Internal testing needs no Beta App Review. Check A happens here.
- **External testing.** An external group named "Friends", email invitations only, no public link. Adding the first build to the group sends it to Beta App Review.
- **Test information** (beta description, What to Test, feedback email, review contact, sign-in, privacy policy URL) is prepared in the runbook to paste. The privacy policy URL and reviewer sign-in are owner gates (§10).
- **Invitations go to one friend first.** After Check B passes, the others.

## 7. Tour and What's New rollout

**What's New today.** `GET /me` returns no What's New and no trial notice while an account is "due" its tour (21j RD-7). The phone only starts the tour itself when `app-config.tourAutoStart` is true. With the gate off, a due account would never see the "Overload on iPhone" sheet.

**The change.** The mobile `me` view holds back the trial notice and What's New for a due account only while the automatic tour is on, because only then is a tour about to take the launch. With the gate off, a due account gets What's New like anyone else. `tour.autoStart` still says the account is due. The phone also never opens the sheet while a tour is running.

| Account | Gate off | Gate on |
| --- | --- | --- |
| New, never toured | What's New sheet; no tour | Tour offer on Today; What's New after Done, Skip, or Not now |
| Finished the web tour | What's New sheet | What's New sheet |
| Skipped the web tour | What's New sheet | What's New sheet |
| Finishes the native tour | outcome recorded; What's New next | same |
| Skips the native tour | outcome recorded; What's New next | same |
| Not now on a manual tour | records nothing; What's New unaffected | same |
| Not now on the automatic offer | (cannot happen) | records "skipped"; What's New next |
| Several unseen notes | one sheet, newest first | same, after the tour |
| Relaunch after Got it | nothing (seen point stored) | same |

Nothing marks a note seen except closing the sheet that showed it.

**The release note.** "Overload on iPhone", significant, `audience: "internal"` (not a public launch). It shows on both clients, so its words work for a web reader who hasn't been invited. It reaches Production with the `me` change, at the start of the beta, and is dated that day.

**The automatic tour.** It stays off. The proposed timing is after Check B passes. Only accounts that never saw a tour are due: new signups and accounts made on the phone. Friends who used the web won't see it. It's turned on and off with one server variable and a redeploy. No build is needed.

## 8. Release safety

- The Production profile refuses staging's API, Supabase project, and channel. The staging profiles refuse Production's.
- The launch check repeats the refusal on the values inside the binary. A misconfigured build shows a gate and makes no network call.
- In Production, a Vercel protection answer (which can only happen on staging) is treated as "unreachable", never as the staging access screen.
- No secret is in the binary. The Supabase key it carries is the public anon key, and RLS is deny-all.

## 9. Recovery and replacement builds

- **Pause:** stop sending invitations, remove a tester, or expire the build in App Store Connect.
- **JavaScript-only fix:** a `production` channel update reaches only builds with the same runtime. Publishing to `production` is a human step.
- **Native fix:** a new build with the next build number. A new build of version 1.0.0 may skip full review, but don't count on it.
- **Backend incident:** the normal Production rollback (Vercel promote of the previous deployment), then the fix through staging and a release PR.
- **The automatic tour:** remove the variable and redeploy.
- Installed native code can't be rolled back instantly. TestFlight can stop new installs and offer a newer build.

## 10. Beta feedback operations

- **In the app:** More → Send feedback (with an optional screenshot) reaches the owner's existing admin inbox on Production.
- **Email:** `support@overloadtraining.app`, shown in Get help.
- **TestFlight:** testers can send screenshots and comments from the TestFlight app, which App Store Connect collects.
- **Triage:** critical (security or data integrity: pause the beta at once), blocker (fix before more invitations), important usability (next build), minor polish (backlog).

## 11. Surfaces affected

| Surface | Change |
| --- | --- |
| More, footer | "Overload 1.0.0 (build)" in Production, "· Staging" in staging; an About this app row in every build |
| About this app (new, pushed from More) | read-only build identity |
| Welcome | the environment badge shows nothing in Production |
| Misconfigured gate | wording that fits either environment |
| Delete account | OVE-255 wording (Check again) |
| Signed-out notice | OVE-255 timing (finish on the web) |
| What's New sheet | first native entry; never over a tour |

## 12. Mobile design (the native visual contract)

Built with `overload-mobile-ui` on the 21d–21k system: `GroupedList` and `ListRow`, `Text` tones, tokens only, the system back header on pushed screens. The visual review artifact (M1 footer, A1 About this app in Production and staging, the What's New sheet with the new entry, the Check again message; light and dark; illustrative values labelled) is the design canvas linked in the spec's RD-20. Where it and this section differ, this section wins.

### M1 More footer

```text
│ ┌────────────────────────────┐ │
│ │ Delete account           › │ │
│ └────────────────────────────┘ │
│                                │
│       Overload 1.0.0 (3)       │   Production: version and build
│ ┌────────────────────────────┐ │
│ │ About this app           › │ │   every build
│ │ Diagnostics              › │ │   staging only
│ └────────────────────────────┘ │
```

Staging reads "Overload 0.1.0 · Staging". About this app is in the same group as Diagnostics, apart from routine rows, like Diagnostics today.

### A1 About this app

```text
┌──────────────────────────────────┐
│ ‹ More      About this app       │
│                                  │
│ THIS BUILD                       │
│ Environment          Production  │
│ Server  www.overloadtraining.app │
│ Sign-in project  ycxvdiklpefy…   │
│ Version                   1.0.0  │
│ Build                         3  │
│                                  │
│ UPDATES                          │
│ Running         Embedded bundle  │
│ Channel              production  │
│ Update group                  —  │
│ Published                     —  │
│ Runtime              8c1f20ab9e  │
│                                  │
│ Nothing on this screen is        │
│ private. Share it when you       │
│ report a problem.                │
└──────────────────────────────────┘
```

- Values are right-aligned `ListRow` values, so long hosts truncate in the middle of the row, not off screen.
- Environment reads "Production", "Staging", or "Staging · local API". A misconfigured build never reaches this screen.
- No token, key, email, password, or account name. The sign-in project id is public (it is in the sign-in URL).
- Read-only. No copy button in this slice: a screenshot is the report.
- Large text: rows wrap the value under the title (the existing `ListRow` behavior).

### Delete account: Check again (OVE-255)

The account is still present after Check again, whatever its training data: the form returns with "Your account is still here. If you just tried, wait a moment and check again." The "training data was deleted" message appears only when the server answers `identity_pending` to a delete.

### Signed-out notice (OVE-255)

Unchanged words. It now appears only when `/me` still refuses the account a moment later. If the second look finds the sign-in gone, the phone signs out with no notice, as for any ended session. If it finds the account, nothing happens.

### What's New sheet

The existing A5 sheet with one more entry at the top:

```text
│          What's new            │
│                                │
│ Overload on iPhone      Nov 26 │
│ Overload now has an iPhone app,│
│ in a private beta for invited  │
│ testers. …                     │
│                                │
│ ┌────────────────────────────┐ │
│ │          Got it            │ │
│ └────────────────────────────┘ │
```

### Gates

- **Misconfigured:** "This build is misconfigured" / "It can't connect to Overload. Install the latest version." The variable names stay listed below, never their values.
- **Staging access:** never shown in Production.

## 13. Accessibility and privacy

- About this app rows read as "Environment, Production" to VoiceOver (the existing `ListRow` label).
- Nothing on About this app identifies the lifter.
- The release note contains no link (release-note rules) and no personal data.

## 14. Out of scope

App Store screenshots, a store listing, keywords, an age rating beyond TestFlight's needs, a copy button on About this app, a `platforms` field on release notes, and any change to screens the owner accepted beyond §11.

## 15. User guidance

- **Release note:** "Overload on iPhone" (§7), written with `overload-onboarding`.
- **Tour:** no new step. About this app is a support screen, not part of the training journey. The existing nine steps read correctly in Production.

## 16. Plan placement and client scope

Free. Native iOS for every surface in §11. The web shows the release note through its existing What's New. The mobile `me` change is server-side and additive in behavior only, with no contract change.
