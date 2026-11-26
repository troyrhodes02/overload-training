# Pitch 21l — TestFlight Beta

> Source: the run prompt the owner supplied on 2026-11-26 ("Pitch 21l: TestFlight Beta, one-shot autonomous release and distribution pipeline"), condensed here without changing its substance. It expands `docs/planning/mobile-roadmap.md` → "21l — TestFlight Beta (M, mostly human)": *device polish, the production release of the mobile API through the promotion workflow with a backward-compatibility check, a Production-connected build, App Store Connect setup, Apple's beta review for the first external build, and inviting the friends.*

**Project:** Overload V1
**Parent:** Pitch 21 — Mobile App
**Milestone:** MVP 5B — Mobile App (Linear: "Pitch 21l — TestFlight Beta")
**Type:** Release and distribution slice, with small engineering fixes
**Appetite:** Medium (M), mostly human steps
**Client scope:** Native iOS (configuration, three small screens or messages), plus one additive behavior change in the mobile `me` view and one release note. The web gets the release note only.
**UI-bearing:** Yes, thinly (mobile-only: no `preview.tsx`; the visual contract is design.md §12)
**Plan placement:** Free. Distribution, guidance, and build identity are never gated.
**Dependencies:** 21a–21k and OVE-241, all released to Production.
**Downstream:** MVP 5C. Nothing in it starts automatically.

---

## 1. Problem

The iPhone app is complete through 21k and accepted on the owner's iPhone, but every artifact so far is staging-only by construction. The app config, the launch check, and the EAS profiles refuse Production. Nobody but the owner can install it, and the owner's build talks to the `overload-dev` project.

The friends who train on the website today cannot use it on their phones. They must not be asked to make new accounts, and nothing about their history may change.

## 2. Desired outcome

An existing friend installs Overload from a private TestFlight invitation, signs in with the account they already use on the web, logs their next real workout, and sees it on the website.

At the same time:

- the owner's staging development build keeps receiving staging updates;
- a Production build can never connect to staging, and a staging build can never connect to Production;
- the owner can see, on the phone, which environment and build they are running;
- the deferred OVE-255 wording and timing fixes ship before the first build;
- the first native release note, "Overload on iPhone", is visible on the phone.

## 3. Appetite

Medium. The engineering is small and bounded. The calendar time is set by Apple's review and by the owner's and a friend's availability.

## 4. Owner-level decisions (pre-resolved)

| ID | Decision |
| --- | --- |
| RD-1 | Private external beta. Email invitations or an owner-approved group, never a public link. The owner approves every recipient. |
| RD-2 | Friends use their existing Production accounts. No copied Production data, no fake history. |
| RD-3 | The TestFlight app connects to the Production API and the Production auth project, verified at build time and on the device. |
| RD-4 | Staging stays as it is: its channel, credentials, build, and update workflow. Nothing crosses between the two. |
| RD-5 | No new training features and no MVP 5C work. Fix confirmed release blockers only. |
| RD-6 | No native purchase flow: no Stripe, no StoreKit, no promo codes, no upgrade buttons, no unapproved purchase links. |
| RD-7 | OVE-255 is fixed before the release candidate, with the deletion module and the Stripe order unchanged. |
| RD-8 | The first native What's New entry is "Overload on iPhone", written for an invite-only beta. |
| RD-9 | `MOBILE_TOUR_AUTO_START` stays off until the owner approves the Production rollout. |
| RD-10 | Existing web tour outcomes stay authoritative. Nothing is reset. Manual replay stays in More. |
| RD-11 | Privacy, signing, and export-compliance answers are real gates. Facts are gathered; nothing is invented. |
| RD-12 | No Production test mutations. A reviewer account needs explicit approval. |
| RD-13 | Two manual checks only: the owner's Production build smoke test (Check A) and one friend's real workout (Check B). |
| RD-14 | TestFlight only. No App Store submission, no public availability. |
| RD-15 | Keep the rollout reversible: pause invitations, expire builds, turn the tour off, ship a replacement build, and keep every lifter's data. |

## 5. Solution shape

1. **OVE-255.** "Check again" never claims data was deleted while the account is still present. A `/me` 401 shows the "finish on the web" notice only after a second look, outside the web deletion's short identity-removal window.
2. **Production environment.** A Production app environment beside staging, each refusing the other's values in the config, at launch, and in tests. The staging config output and its imported files are byte-for-byte unchanged, so its runtime fingerprint holds.
3. **App identity.** "Overload", a Production bundle identifier separate from the development one, version 1.0.0, EAS-managed build numbers, a `production` build profile and update channel.
4. **About this app.** A read-only screen in every build showing the environment, server, sign-in project, version and build, channel, and the running update.
5. **What's New on the phone.** While the automatic tour is off, a due account is no longer denied What's New. The sheet never opens over a running tour.
6. **"Overload on iPhone".** One release note, released to the web with the change above at the start of the beta.
7. **Distribution.** The owner runs one build-and-submit command (Apple sign-in), smoke-tests the internal TestFlight build, completes Apple's test information and review, approves recipients, and invites one friend first.

## 6. Human approval boundaries

- **Apple sign-in, signing, and the EAS build cost.** The owner runs the build.
- **A privacy policy URL** (Apple requires one; Overload has none published).
- **Reviewer access** for Apple, if Apple needs a sign-in.
- **The Production web release** of the What's New change and the release note.
- **Beta App Review** (Apple decides).
- **Recipients** (the owner names them).
- **Turning on the automatic tour** on Production.
- **Check A and Check B.**

## 7. Risks

- **Wrong environment.** A friends' build pointed at `overload-dev` would show empty accounts and write nowhere real. Each profile refuses the other's values, and About this app shows the truth.
- **Cutting off the staging build.** Any change to a file the config imports moves the staging fingerprint. The Production module is loaded only for Production, and a test pins the staging inputs.
- **Apple review.** Review may ask for a sign-in, a privacy policy, or a change. Only the named correction is made.
- **A friend's first workout fails.** The beta pauses, the bug is fixed on staging, and a replacement build follows the normal path. Logged history is never touched.

## 8. Rabbit holes

- Polishing screens that work. Only blockers and small preflight corrections are in scope.
- A platform field on release notes. The note's wording carries the platform (21j RD-6).
- App Store metadata (screenshots, keywords, age rating beyond what TestFlight requires).
- An App Store Connect API key or CI build pipeline. The owner's one interactive command is enough for a private beta.

## 9. Out of scope

MVP 5C (wing-it workouts, the history calendar, friends and sharing, progress cards, gym location, notifications). Any purchase flow. A public App Store release. Android. Copying Production data anywhere. Re-running the 21d–21k acceptance.

## 10. Definition of done

1. The iPhone app is configured for Production, and staging is unchanged.
2. Production API compatibility is verified.
3. OVE-255 and every confirmed blocker are fixed.
4. Signing and distribution are configured.
5. App Store Connect holds the app and its TestFlight setup.
6. A real Production-connected build is uploaded.
7. Apple approves it for external testing.
8. The owner approves the recipients.
9. At least one existing friend installs it.
10. That friend signs in with their existing Production account,
11. logs a real workout,
12. and sees it in History and on the web.
13. The owner has a written way to handle issues and ship replacement builds.
14. The staging development workflow still works.

An uploaded build, an internal install, or Apple's approval alone is not done.
