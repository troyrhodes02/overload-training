# Pitch 10 — Personalization & Navigation Polish — Run Report

**Run:** autonomous pitch pipeline, 2026-10-19 (local) · **Slug:** `10-personalization-navigation-polish`
**Outcome:** implemented, integrated, reviewed, audited, and verified on `feat/10-personalization-navigation-polish` (head `4619197` + this report). The feature PR **[#62](https://github.com/troyrhodes02/overload-training/pull/62) is open and ready for review, not merged.**
**Why not merged:** the run prompt said merge on green "following the pipeline guide's merge-behavior rules", and to stop "if the implementation crosses a protected boundary that requires stopping before merge". Guide Appendix D1 says to stop before merge when a pitch "changes schema on tables that hold user data". The per-account appearance preference adds `profiles.appearance` (migration `9b_profile_appearance`). Merging would also deploy code that reads a column production does not have yet, which would break every signed-in page. The migration is a human runbook step. See spec R3.
**Production:** untouched. Nothing was read from or applied to `overload-prod`; no secret, env var, or setting was changed; signup state unchanged. **No halt condition was hit.**

---

## 1. What shipped (on the feature branch)

| Area | Result |
| ---- | ------ |
| Greeting | Today now opens with one plain `h1` on every dashboard state. It is a salutation from the account's **stored** timezone (morning 04–12, afternoon 12–17, evening 17–24, "Hello" 00–04), the first name, and one factual clause: planned, underway, late night (21:00–03:59 for planned or underway lifting), cardio planned, done (lifting or cardio-only), rest, no plan, or first visit. A missed earlier day never changes it. Wording is the design doc's library, picked deterministically by FNV-1a over account + local date + situation, so it is stable on screen. A missing first name drops the name; an unusable stored zone says "Hello" and never uses the late-night family. First visit is derived (profile created today locally, nothing logged — workout or cardio), with no new state. `composeGreeting` is pure. |
| Appearance | Settings → Appearance offers Light, Dark, and System (default) as RadioGroup tiles. The value is stored on the account's own `Profile` (enum, `NOT NULL DEFAULT 'system'`) and read/written only through the account-scoped client. Choosing a tile applies instantly everywhere (html class, browser chrome color, transitions suspended) and saves in the background. The last choice wins; a failed save reverts to what the account actually holds, with an inline error. A static `<head>` boot script paints a returning device from its local mirror (no flash). `AppearanceSync` re-applies the stored value after hydration and navigation, and stands aside while a save is in flight. The `dark:` variant now also matches System-dark, `color-scheme` follows the mode, and toasts take the account's appearance. |
| Phone navigation | Below `md` the six-item bottom bar is gone. A sticky header holds a menu button that opens a shadcn `Sheet` with the same destinations (shared `nav-items.ts`), then Settings. The sheet closes on a choice, a route change, Escape, ×, the scrim, or the viewport reaching md, and opens focused on the current item. Thumb-reach action bars sit at the bottom edge. |
| Desktop | Unchanged: the rail keeps its original classes verbatim behind `hidden md:block`, and the header computes to the same styles (e2e asserts 224px sticky rail with border-right, and header padding 12/16). |
| Schema | `enum Appearance { system light dark }` and `Profile.appearance`. Migration `9b_profile_appearance` is additive (enum + defaulted column). No new table, so no RLS change. |
| Tests | Unit: greeting (library equality with the design doc, situations, time bands, late window, zone/DST/server-TZ independence, determinism, tone guard, purity), appearance (values, action contract, applier, boot script, Settings-only guard), save ordering, navigation guards. Integration: schema shape + enum refusal, appearance isolation, new `isolation/greeting.int.test.ts` (registered in the coverage registry). New local-stack `e2e/accounts/personalization.spec.ts`. |
| Docs | Pitch copy, design doc v1.0, UI preview (HTML, 34 frames), spec v1.1.0 (R1–R29), runbook + `docs/runs/10-sql/verify-appearance.sql`. |

## 2. Linear and PRs

Milestone **Personalization & Navigation Polish** (Overload V1). Tickets are chained with `blockedBy`. All are **In Review**: their PRs are squash-merged into the feature branch, which is not in `main`.

| Ticket | PR | Squash into feature branch |
| ------ | -- | -------------------------- |
| [OVE-46](https://linear.app/overload-training/issue/OVE-46) Phone navigation: header menu button + sheet, bottom bar removed, desktop rail unchanged | [#63](https://github.com/troyrhodes02/overload-training/pull/63) | `d4e3a79` |
| [OVE-47](https://linear.app/overload-training/issue/OVE-47) Appearance preference: Profile.appearance + migration, Settings section, no-flash application | [#64](https://github.com/troyrhodes02/overload-training/pull/64) | `953485d` |
| [OVE-48](https://linear.app/overload-training/issue/OVE-48) Dashboard greeting | [#65](https://github.com/troyrhodes02/overload-training/pull/65) | `ac55966` |
| [OVE-49](https://linear.app/overload-training/issue/OVE-49) Local-stack Personalization e2e + visual verification | [#66](https://github.com/troyrhodes02/overload-training/pull/66) | `63a4cfb` |

- Feature PR: [#62](https://github.com/troyrhodes02/overload-training/pull/62), with review fixes in `4619197`.
- Integration followed Pitch 9's method. For each PR: retarget it to the feature branch, merge the feature branch into it (one conflict, `app-shell.tsx` on #64, resolved with the ticket's superset), require the only delta from the ticket tip to be the feature-branch docs, wait for Vercel, then squash. The final feature tree equals the OVE-49 tip. No force-push.

## 3. Verification (all run, all passing)

Final state, code identical to `4619197`:

| Check | Result |
| ----- | ------ |
| `npx prettier --check .` | pass |
| `npm run lint` | pass |
| `npx tsc --noEmit` | pass |
| `npx prisma validate`; local `prisma migrate status` | valid; local stack up to date |
| Unit (`npm test`) | **43 suites / 735 tests** |
| Integration (embedded Postgres; permanent isolation suite, history integrity, RLS deny-all, schema, guards) | **34 suites / 423 tests** |
| `npm run build` (local-stack env, invite code + service key set) | pass |
| `npm run verify:client-bundle` | OK — no server secret in `.next/static` |
| Accounts e2e (`npm run test:e2e:accounts`, local Supabase) | **13 passed** (lifecycle 7 + personalization 6); local DB unchanged afterwards (1 auth user, 1 profile, 463 logged sets) |
| Default e2e (`npx playwright test`) | **26 passed** |
| Vercel check on #62–#66 | pass |

Per-ticket verification (lint, typecheck, format, unit, integration, build, browser checks) is recorded in the progress file.

### Pitch-specific evidence

| Requirement | How it was verified |
| ----------- | ------------------- |
| Greeting context (AC-1) | Unit: every `DashboardDto` kind maps to the right situation, including missed day with/without today's session and cardio pending/logged/mixed. Pending/underway never say done; rest/no-plan never name a session. e2e: first visit without a plan shows "Welcome to Overload, Robin." / "Welcome, Robin." with nothing implying a workout. |
| Stability / no flicker | Unit: the same sentence all morning for one account+date+situation, and identical 1 s apart; all variants reachable across 60 days. Server-rendered text only. e2e: identical after reload. |
| Account-local time | Unit: band boundaries in America/Chicago, the same instant across UTC+14/UTC−11/Tokyo, results identical with the process TZ set to UTC/Tokyo/LA, and DST boundaries in America/New_York. |
| Missing timezone (PRD edge case) | Unit: null zone → "Hello", no late-night family. Integration: an invalid stored zone is reported. e2e: invalid zone written for the suite's own temporary account → Today renders a greeting, no error. |
| Appearance persistence, System default (AC-2) | Integration: new profiles read `system`; the DB refuses values outside the enum. e2e: System default → Dark at once (also painted at DOMContentLoaded after a reload) → a fresh device gets Dark after sign-in → System follows the emulated device live → Light overrides a dark device → persists on reload. |
| Appearance isolation | Integration: writes touch only the acting profile; a scoped update on another account's id → count 0. e2e: a second account starts at System and its choice leaves the first account's alone. |
| Phone navigation (AC-3) | e2e at 375: rail/bottom bar hidden; the sheet lists the 6 destinations + Settings in order, `aria-current` on the current item with focus on it; choosing Goals navigates and closes; Escape closes with focus back on the menu button; the scrim closes; Settings is current on /settings; the Gyms thumb bar has `bottom: 0`. |
| Desktop unchanged | e2e at 1280: no menu button; rail 224px, sticky, 1px border-right, 0 border-top; header padding 12/16/12/16, static. Unit guard: rail classes verbatim. Screenshots. |
| UI vs preview | Chrome screenshots at 375 and 1280, light and dark: first-visit Today, Settings with each tile selected, sheet open (Today active), Gyms thumb bar at the edge, desktop rail. Hierarchy, copy, controls, and tokens match the preview. The preview itself: 34 frames, 0 console errors, 0 network requests, Inter loaded, 0 phone overflow. Not rendered in a browser: the populated pending-workout greeting (it needs an active plan on a temporary account); unit tests over real `DashboardDto` shapes cover it. |
| Standing invariants (guide D4) | RLS on every table with 0 policies; anon Data API; unauthenticated redirects; single `LoggedSet` write path; archive keeps history; Restrict on hard delete; no stored tag/e1RM; baseline isolation/atomicity; deload separation; cross-account isolation incl. the new greeting suite; `userId` on every owned model; scoped-access static check; deletion only removes the requester's rows. All green in the unit + integration suites. |

## 4. Resolved Decisions (made on the owner's behalf)

All are in the spec's `## Resolved Decisions`, with rationale and authority. Summary:

- **R1** The controlling planning docs are the owner's multi-user set in `Downloads/` (standing). **R2** The preview is `.html`, not the run prompt's `.tsx` (standing; skill + owner feedback).
- **R3 — stop before merge** (guide D1; schema change on `profiles`; production ordering).
- **R4** `Profile.appearance` enum, default `system`, no new table. **R5** Additive migration `9b_profile_appearance`, local only; production is a human step.
- **R6 — please review:** first paint uses a per-device `localStorage` mirror read by a static boot script; the profile stays the only authority. This was chosen because Cache Components keeps the root layout static. It is not a cache of application data, but it is a second place the value lives.
- **R7** (amended in review) instant apply plus background save; last choice wins; revert to the stored value; the shell stands aside while a save is in flight. **R8** `dark:` variant + `color-scheme` + theme-color + toasts follow the choice.
- **R9 — please review:** the pitch's "persistent sidebar" on phones is the code's bottom bar, now replaced by a menu button + sheet. This supersedes the `overload-ui-design` skill's "never hide core navigation behind a hamburger". **R10** Settings is in the sheet only, not the rail. **R11** sticky phone header. **R12** thumb bars at the bottom edge; no safe-area work. **R13** shadcn Sheet, no new dependency.
- **R14** situation mapping. **R15** time bands and late-night scope. **R16** FNV-1a pick. **R17** (amended) first visit = first local day with no logged workout or cardio. **R18** "missing timezone" = unusable stored zone. **R19** nameless forms. **R20** server-rendered. **R21** one wording table, asserted against the design doc.
- **R22** No guidance ticket. **R23** Four tickets. **R24** Owner's files untouched. **R25** No email work. **R26** Local stack stands in for preview-deployment verification.
- **R27** (review) Profile fields are not folded into `Account`; per-request memo instead. **R28** (review) Rail classes kept verbatim. **R29** Radix scrim timing quirk accepted (see §6).

**Bucket-C defaults for the owner to confirm (guide D2):** the greeting wording library (design doc, Screen 1), the time bands (morning 04:00, afternoon 12:00, evening 17:00, "Hello" after midnight), the late-night window (21:00–03:59, standing), deterministic variation (standing), appearance stored on the account with System as the default (standing), and the first-visit definition (R17).

## 5. Code review and audit dispositions

Review: the `code-review` skill (high) left 9 inline comments on #62. The audit is [posted on #62](https://github.com/troyrhodes02/overload-training/pull/62#issuecomment-6282779205). Fixes are in `4619197`, and the affected checks were rerun (§3).

| # | Finding | Disposition | Resolution |
| - | ------- | ----------- | ---------- |
| 1 | A superseded successful save never updated `confirmed`, so a later failure reverted to the wrong value | **Implement** | `createChoiceTracker` records successes in tap order and reverts to the newest accepted value; a thrown action counts as a failure; unit tests replay the reviewer's scenario |
| 2 | An earlier save's `refresh()` re-applied a stale appearance over a newer choice | **Implement** | `AppearanceSync` stands aside while any save is in flight; the island applies the final outcome |
| 3 | Profile's `///` doc attached to `enum Appearance` | **Implement** | Enum moved above the Profile docs (no DDL change) |
| 4 | Layout makes an extra profile read per render | **Defer** (R27) | Folding profile fields into `Account` changes the identity chokepoint; noted as a candidate refactor |
| 5 | Settings reads appearance twice per request | **Implement** | `getAccountAppearance` wrapped in React `cache` |
| 6 | Greeting facts re-read profile data `resolveAccount` loaded | **Defer** (R27) | Same chokepoint reasoning; one PK read per Today render |
| 7 | `localDate` duplicates `isoDateInZone` | **Implement** | Reuses `isoDateInZone` (import-free, greeting stays pure) |
| 8 | `count()` where existence suffices; cardio ignored for first visit | **Implement** | `findFirst` existence checks on `LoggedSession` and `CardioLog`; R17 amended; integration test added |
| 9 | "Dead" mobile classes on the rail | **Skip** (R28) | Not dead: `inset-x-0 bottom-0 z-10` still apply at md+; desktop must not change |

## 6. Near-misses and things worth knowing

1. **`.env` holds production values.** Every DB/Supabase command used local-stack values (scratchpad `localenv.sh`, which refuses non-127.0.0.1). Integration tests use embedded Postgres; the accounts e2e takes keys from `supabase status`; the default e2e is pinned to an unroutable DB.
2. **A temporary local account was left behind once.** A browser-check script was piped to `head`, which killed it before its cleanup ran. The account (`visual-…@example.test`, no data) was removed through the app's own deletion flow. The local DB is back to 1 auth user / 1 profile / 463 sets, and check scripts now log to files.
3. **The isolation guard caught a naming slip.** The greeting's seed field was first called `userId`; the guard "outside the data layer, `userId` only as `account.userId`" failed. It was renamed to `accountKey`, and the guard was left as is.
4. **Radix scrim timing quirk (R29).** A scrim tap within ~300 ms of re-opening the sheet right after a quick close can be ignored by Radix's dismiss layer. Nobody is trapped: ×, Escape, and links always work, and with a 300 ms wait, 12/12 dismissals succeeded. The e2e waits for the slide-in. If it ever matters in practice, a shorter open animation or a custom overlay handler is the fix.
5. **A pre-existing environment-sensitive unit test.** `tests/unit/import-target-and-images.test.ts:108` fails only when `NEXT_PUBLIC_SUPABASE_URL` is exported in the shell, because `exerciseImageUrl` falls back to the env var. This pitch didn't cause it; it passes in a clean environment (12 consecutive runs). Worth hardening (pass `undefined` explicitly or stub the env) in a small follow-up.
6. **#63 was squashed before its Vercel check had finished**, because my wait loop matched the "Vercel Preview Comments" line. The deployment then passed. Later PRs used `gh pr checks --watch`.
7. **The review found two real race bugs** in the appearance save path (fixed). Rapid double taps are plausible on a phone, so these were worth having.
8. The local Supabase stack now has `9b_profile_appearance` applied (local only). The rehearsal of `verify-appearance.sql` there shows RLS on with 0 policies, all profiles `system`, and history counts unchanged.

## 7. Required upstream amendments (not made — `docs/planning/` is read-only during a run)

1. **Commit the multi-user planning set into `docs/planning/`** (pending since Pitch 8).
2. **Architecture → Data model → Profile:** add the appearance preference (`system | light | dark`, default `system`). **PRD → Data objects → Profile:** same.
3. **Pitch 10 text:** the phone "persistent sidebar" is a bottom bar in the shipped code (R9); the feature is the same.
4. **`overload-ui-design` skill:** "navigation is a simple bottom bar on mobile. Never hide core navigation behind a hamburger menu" is superseded by Pitch 10 (R9). The preview template's frames still draw a bottom nav. Its token block predates the electric-blue brand (the preview re-copied from `globals.css`). "Logo: none exists yet" is stale, since `OverloadLockup` ships a brand mark. **`overload-design-doc` skill:** the IA example's "Bottom bar (mobile)" and its responsive table ("bottom navigation bar") are stale. Both skills, plus `overload-spec`, `overload-ticket-worker`, and `overload-review-audit`, still describe a single-user product.
5. **Email / password reset discrepancy (pitch §13):** the PRD's Accounts feature and acceptance criteria, Architecture → Auth & Identity ("Password reset is by email … custom SMTP"), the Pitch Roadmap's Pitch 9, and guide D2 ("Password reset", "Email provider: Resend") still describe email reset. `.claude/CLAUDE.md` says the same in Stack → Email, Access and registration model, Testing item 6, and the D4-style standing test "a reset request gives the same response". Reset was removed from the Accounts implementation (Pitch 9 R28). The docs need to say reset is deferred until an email provider is chosen, and that a forgotten password is an owner operator task. Nothing was restored here.
6. **Pipeline guide Appendix C / §5 / D5:** the preview path is `docs/previews/<slug>-preview.html` (skill + owner feedback), not `.tsx`.
7. **Pipeline guide D1:** worth stating explicitly that a pitch whose code reads a new column cannot merge before its production migration. That is the practical reason Pitch 10 stops even though D1's roadmap list names it merge-on-green.
8. **Root `CLAUDE.md`** is still the single-user version; `.claude/CLAUDE.md` governs (uncommitted owner change, never staged by this run).
9. **CLAUDE.md "verify on a preview deployment with real-shaped data":** there are no DB-backed previews; the local stack was used (R26).

## 8. Outstanding human steps

Follow `docs/runs/10-personalization-navigation-polish-runbook.md`:

1. **§1** Confirm production is on the Accounts release, with only `9b_profile_appearance` pending (`prisma migrate status` against production, from a trusted machine).
2. **§2** Back up production (`pg_dump`) and note the history counts.
3. **§3** Apply `9b_profile_appearance` (`prisma migrate deploy`), **before** merging.
4. **§4** Run `docs/runs/10-sql/verify-appearance.sql` and compare.
5. **§5** Review and squash-merge #62 (deploys). Move OVE-46…OVE-49 to Done.
6. **§6** Manual check in production (greeting, appearance, phone sheet, desktop unchanged).
7. Review **R6** (first-paint mirror), **R9** (bottom bar → sheet; skill superseded), and the bucket-C defaults in §4.
8. Still open from Pitch 9 (unrelated to this pitch's merge): the Multi-User Foundation production verification gate is not recorded in the repo, so signup must stay closed until it is. The owner's uncommitted `.claude/CLAUDE.md` and the repo-root backup dump are untouched; consider moving the dump out of the working tree.

## 9. Open questions (undecidable by the run)

1. **Greeting copy** — bucket-C wording (design doc library). Changing it means editing the constant table plus the test copy; the unit test pins it to the design doc.
2. **Folding profile fields into `Account`** (R27) — a small performance and clarity refactor of the Multi-User Foundation chokepoint. It should be its own reviewed change if wanted.

## 10. Halt conditions

None triggered. The stop before merge is a merge-behavior outcome (guide D1), not a halt. Production data, credentials, and the service-role key were not touched. No `LoggedSet`, baseline, or deletion path changed. No new table and no RLS change. No destructive operation: the one migration is additive and was applied only to the local stack and test databases.

## 11. Deferrals

- R27: fold profile fields into `Account` (review findings 4 and 6).
- Harden `tests/unit/import-target-and-images.test.ts` against an exported `NEXT_PUBLIC_SUPABASE_URL` (pre-existing).
- Radix scrim timing quirk (R29), only if it shows up in real use.
- Out of scope by the pitch: Onboarding Tour, What's New, Faster Logging UX, email/password reset, any desktop navigation change.
