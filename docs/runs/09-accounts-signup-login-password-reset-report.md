# Pitch 9 — Accounts: Signup, Login & Password Reset — Run Report

**Run:** autonomous pitch pipeline, 2026-10-19 · **Slug:** `09-accounts-signup-login-password-reset`
**Outcome:** implemented, integrated, reviewed, and verified on `feat/09-accounts-signup-login-password-reset` (head `fb01605` + this report). The feature PR **[#56](https://github.com/troyrhodes02/overload-training/pull/56) is open, not merged** (run prompt: do not merge into `main`).
**Production:** untouched. No production data, credentials, settings, or env vars were read or changed; nothing was applied to `overload-prod`; **signup stays closed** (no `OVERLOAD_INVITE_CODE` anywhere but local tests). No halt condition was hit (see §10 for the one judgment call that came closest).

---

## 0. Post-run amendment — password reset removed (owner direction, 2026-10-19)

After the run, the owner chose not to set up a transactional email provider yet, so everything that needs one was removed from the feature branch (spec **R28**, design doc v1.2). Sections 1–11 below describe the run as it finished and are kept for the record; where they mention recovery, Resend, SMTP, Mailpit, or `/forgot-password`, this section wins.

- **Removed:** the "Forgot password?" link on Login, `/forgot-password`, `GET /auth/confirm`, `/reset-password`, `src/lib/accounts/recovery.ts`, the recovery email template and `otp_expiry` in `supabase/config.toml`, the recovery-only session gate in `requireUser()` (back to `main`'s version), the `password-updated` login notice, the "reset your password" link in signup's "already exists" message, the recovery unit tests, and the reset e2e (default and lifecycle). Signup was the only other feature that could have needed email; it creates accounts already confirmed, so it needs none.
- **Kept:** invite-gated signup, login/logout, Settings, account deletion, and `secure_password_change = true` (R27 hardens the auth API itself).
- **Added:** an e2e check that the old reset routes redirect to Login; runbook §8, a tested operator procedure for a forgotten password (the owner sets a temporary password with SQL in `overload-prod`).
- **Known gap:** no in-app password change, so a lifter keeps a password the owner set until a "Change password" form exists. That needs no email provider and would be a small follow-up pitch.
- **Verification after the removal** (all run, all passing): format, lint, typecheck; unit 39 suites / 617 tests; integration 33 / 407; build (no reset routes) + `verify:client-bundle`; default e2e 26; Accounts lifecycle e2e 6/6 on the local stack (restarted to load the trimmed config). The runbook §8 SQL was rehearsed on a throwaway local user that was then deleted. Local data unchanged: 1 profile, 1 auth user, 463 sets.
- **Linear:** OVE-43 (Password recovery) shipped into the feature branch and was then removed; it no longer describes anything that will reach `main`.

## 1. What shipped (on the feature branch)

| Area | Result |
| ---- | ------ |
| Signup | `/signup`: invite code first (server-only `OVERLOAD_INVITE_CODE`, sha256 + `timingSafeEqual`), first/last name, email, password, hidden browser timezone. **Closed** unless a ≥ 12-char code is configured. A wrong code is the only error and creates nothing; "already exists" only after a valid code. Accounts are created confirmed with the admin API; Supabase project signup stays **disabled** (the anon key can't create accounts). Failure after creation is compensated (identity deleted, session cleared). |
| Login / logout | Login polish (heading, "Forgot password?" carrying the typed email, "Have an invite? Create an account", notices, one message for unknown email = wrong password, rate-limit and network messages). Account menu gains **Settings**; sign-out unchanged. |
| Recovery | `/forgot-password` (identical answer for every address; the request goes out after the response via `after()`), recovery email template, `GET /auth/confirm` (server-verified `token_hash`, any device), `/reset-password` (recovery session ≤ 30 min). A reset link's session is **confined to setting a password** (login-CSRF guard); afterwards **every** session ends and the lifter signs in again. Supabase "secure password change" on. |
| Settings | `/settings`: first/last name, read-only session email, timezone (native select, device-mismatch hint), the stored zone stays the only "today" authority; Delete account entry. |
| Deletion | `src/lib/accounts/deletion.ts` — the one sanctioned destroyer of history: scoped `deleteMany` for every owned model in a fixed order in **one transaction**, then the auth identity, then a best-effort profile sweep. `/settings/delete-account`: counted inventory, password re-check (cookie-less client, session's own email), honest failure messages, retry finishes a half-done deletion. |
| Guards | Service-role key only in `src/lib/supabase/admin.ts` (two importers pinned); invite code only in `invite.ts`; every "never deleted" guard exempts exactly the deletion module, which may only scoped-`deleteMany` in one transaction. Client-bundle scan covers the invite code + service key values. |
| Tests | New isolation test `isolation/account-deletion.int.test.ts` (registered for every owned model); new local-stack **Accounts lifecycle e2e** (`npm run test:e2e:accounts`, refuses any non-127.0.0.1 URL); default e2e can no longer reach `.env`'s DB. |
| Docs | Pitch copy, design doc v1.1, UI preview v1.1 (HTML), spec (R1–R27), runbook + `docs/runs/09-sql/`. |
| Schema | **No change, no migration.** |

## 2. Linear and PRs

Milestone **Accounts: Signup, Login & Password Reset** (Overload V1). Tickets chained by `blockedBy`, all **In Review** (their PRs are merged into the feature branch, which is not in `main`).

| Ticket | PR | Squash into feature branch |
| ------ | -- | -------------------------- |
| [OVE-41](https://linear.app/overload-training/issue/OVE-41) Auth surfaces, login/logout, Settings (name + timezone) | [#57](https://github.com/troyrhodes02/overload-training/pull/57) | `d93cc99` |
| [OVE-42](https://linear.app/overload-training/issue/OVE-42) Invite-gated signup + server-only auth-admin facade | [#58](https://github.com/troyrhodes02/overload-training/pull/58) | `c0c2c92` |
| [OVE-43](https://linear.app/overload-training/issue/OVE-43) Password recovery (enumeration-safe) | [#59](https://github.com/troyrhodes02/overload-training/pull/59) | `49b37e0` |
| [OVE-44](https://linear.app/overload-training/issue/OVE-44) Account deletion | [#60](https://github.com/troyrhodes02/overload-training/pull/60) | `91a3b07` |
| [OVE-45](https://linear.app/overload-training/issue/OVE-45) Local-stack lifecycle e2e + hardening | [#61](https://github.com/troyrhodes02/overload-training/pull/61) | `8fc1816` |

- Feature PR: [#56](https://github.com/troyrhodes02/overload-training/pull/56) — open; review findings addressed in `fb01605`.
- Integration method (as Pitch 8): retarget each child to the feature branch, merge the feature branch into it keeping the child's superset on conflict, **require the only delta vs the child tip to be files byte-identical to the feature branch** (each time: just the runbook + `09-sql`), push, wait for the Vercel check, squash. Final feature tree == OVE-45 tip. No force-push.

## 3. Verification (final, `fb01605` tree; all run and passing)

| Check | Result |
| ----- | ------ |
| `npx prettier --check .` | pass |
| `npm run lint` | pass |
| `npx tsc --noEmit` | pass |
| `npx prisma validate` (local env) | pass (no schema change) |
| Unit (`npm test`) | 40 suites / **631** tests |
| Integration (embedded Postgres; incl. permanent isolation suite, history integrity, RLS, schema, guards) | 33 suites / **407** tests |
| `npm run build` (local-stack env, invite code + service key set) | pass |
| `npm run verify:client-bundle` | no server secret (DB URLs, service key, invite code) in `.next/static` |
| Playwright default (`npx playwright test`) | **28** passed |
| Accounts lifecycle e2e (`npm run test:e2e:accounts`, local Supabase + Mailpit) | **7** passed; local DB afterwards exactly as before (1 profile, 1 auth user, 463 logged sets) |

Per-ticket verification (lint, typecheck, format, unit, integration, build, e2e) is recorded in the progress file.

### Pitch-specific evidence

| Requirement | How it was verified |
| ----------- | ------------------- |
| Invite gate (AC-2) | unit: wrong/missing code ⇒ no auth call; closed ⇒ refusal; constant-time compare. e2e (local): wrong code → error, **0** users created. Default e2e: `/signup` "Signup isn't open". |
| Signup isolation (AC-1) | e2e: new account lands on empty Today; a second account sees none of the first's gyms; profile gets names + browser zone (`America/Denver`). Integration: `establishProfile` create / race-complete. |
| Login / logout | unit: error mapping; e2e: sign out ends access, sign in returns the same account, one message for wrong password and unknown email. |
| Recovery + enumeration (AC-3, PRD edge case) | unit: deep-equal state for known / unknown / rate-limited / failing; reply produced **before** the auth service is called. e2e: identical copy for an unknown address, Mailpit email with the right subject and `/auth/confirm` link, recovery session confined to `/reset-password`, sign-in required after reset, old password fails, other device signed out, reused link → expired. |
| Profile ownership | integration: `updateProfile` changes only the acting profile; another account's profile unreachable. |
| Timezone | integration: a saved zone change moves `accountToday`; e2e: capture at signup + edit in Settings. |
| Deletion only for the requester (AC-4) | integration (two fully populated accounts + library): A deleted → B and library byte-identical, symmetric; injected mid-transaction failure deletes nothing; identity failure → retry finishes; sweep failure ≠ error. e2e: wrong password deletes nothing; right password removes the account; the other account untouched. Live local check: original account (463 sets) and library (876) untouched. |
| UI vs preview | Screens checked in Chrome on the local stack at 375 px and desktop, light and dark (login, settings, account menu, signup states, forgot/sent, reset/same-password, delete/wrong-password, deleted-login): hierarchy, copy, states, and tokens match the preview; one mismatch found and fixed (duplicate "Back to sign in" on the sent state) and invalid-field borders added to match. Preview itself: 51 frames, 0 console errors, 0 network requests, Inter loaded, 0 phone overflow. |
| RLS / secrets | No new table; RLS integration suite green; secret-hygiene guards; client-bundle scan. |

## 4. Resolved Decisions (made on the owner's behalf)

All in the spec's `## Resolved Decisions` with rationale and authority. Summary:

- **R1** Controlling planning docs = the owner's multi-user set in `Downloads/` (Pitch 8 standing R1).
- **R2** One shared invite code in `OVERLOAD_INVITE_CODE`; closed when unset/short — doubles as the production gate. **R5** no per-friend codes.
- **R3** Accounts created with the admin API; Supabase project signup stays OFF everywhere.
- **R4 — please review:** the app now reads `SUPABASE_SERVICE_ROLE_KEY` at runtime, only in `src/lib/supabase/admin.ts` (server-only; create a confirmed user; delete a user). This supersedes Library & Gyms' "never in `src/`, never in Vercel"; that guard was **narrowed to the one file**, not removed.
- **R6** Supabase password rules (min 6) — no custom complexity.
- **R7** token_hash recovery template + `/auth/confirm`. **R8** recovery session = amr otp/recovery ≤ 30 min. **R14** forgot always "sent". **R15** Resend via Supabase custom SMTP (dashboard only).
- **R9** First profile write uses the user returned by the auth service's own sign-in in the same request (data layer).
- **R10** Names stay nullable in the schema (original account has none); required in forms. No migration.
- **R11** Timezone: browser at signup, editable in Settings; the stored zone stays the only "today" authority.
- **R12** Deletion through the scoped client, one transaction, data first then identity. **R13** dedicated page + password as confirmation.
- **R16** Settings via the account menu (no nav change). **R17** Foundation's "no registration surface" e2e replaced by the new contract. **R18** preview is `.html` (skill + owner feedback), not the run prompt's `.tsx`. **R19** `overload-ui-design`'s "no sign-up link" login guidance superseded. **R20** five tickets. **R21** stop before `main`. **R22** root `CLAUDE.md` untouched.
- **R23** (amended in review) reset request sent with `after()`. **R24** retired. **R25** `/forgot-password` reachable when signed in. **R26** recovery-only session confined to `/reset-password`; after a reset every session ends and the lifter signs in again (design change). **R27** Supabase secure password change ON.

## 5. Code review and audit dispositions

Review: `code-review` skill (high) on #56 — 10 inline comments. Audit: [posted on #56](https://github.com/troyrhodes02/overload-training/pull/56#issuecomment-6278021014). All fixed in `fb01605`; affected checks rerun (§3).

| # | Finding | Disposition | Resolution |
| - | ------- | ----------- | ---------- |
| 1 | Post-identity profile sweep could turn a completed deletion into "Nothing was deleted" | **Implement** | Sweep is best-effort and logged; integration test with a failing sweep |
| 2 | Any session could change the password directly at Supabase (`secure_password_change` off) | **Implement** | Enabled locally (verified in the auth container env), required in prod (runbook §3); R27 |
| 3 | Signed-in users bounced from `/forgot-password` (expired flows dead-ended) | **Implement** | Removed from signed-in redirects; R25; routing tests |
| 4 | 1.5 s floor can't hide a slow SMTP send | **Implement** | `after()`; tests prove the reply exists before the service is called; R23 amended |
| 5 | Reset link = login CSRF into the link owner's account | **Implement** | Recovery-only sessions confined by `requireUser()`; global sign-out after reset; R26; e2e covers it |
| 6 | Hardcoded / wrong weak-password copy | **Implement** | `weakPasswordMessage(reasons)` shared by signup + reset |
| 7 | Settings Save stays enabled after trimming | **Implement** | Trimmed comparison |
| 8 | Two diverging sign-in error classifiers | **Implement** | `classifySignInError` shared |
| 9 | Duplicated device-timezone helper | **Implement** | `useDeviceTimeZone()` |
| 10 | Redundant signup gate checks | **Implement** | One env read |

## 6. Near-misses and things worth knowing

1. **`.env` holds production values.** Every DB/Supabase command used local-stack values (scratchpad `localenv.sh`, refuses non-127.0.0.1); integration tests use embedded Postgres; the default e2e server is now pinned to an unroutable DB URL; the accounts e2e takes keys from `supabase status`.
2. **Supabase's own reset endpoint leaks membership**: it returns a 429 only for *known* addresses (verified locally). Swallowed (R14) and moved off the response path (R23).
3. **Login CSRF through reset links** (review finding 5) would have let one person's workouts land in another's account — fixed before review handoff (R26).
4. **Next 16 keeps the previous route mounted (hidden)** after client navigation; test selectors must target visible elements.
5. **Orphaned local test rows**: early ad-hoc browser checks deleted temporary auth identities directly, leaving 4 identity-less profiles (one with a gym) in the **local** DB; found, confirmed test-created and owning nothing else, removed. The lifecycle e2e now cleans up only through the app's deletion flow.
6. The local Supabase stack was restarted twice (to load the recovery template and `secure_password_change`); data persisted (463 sets, 1 user before and after).
7. Port 3200 on this machine is held by an unrelated process; ad-hoc servers used 3317.

## 7. Required upstream amendments (not made — `docs/planning/` is read-only during a run)

1. **Commit the multi-user planning set into `docs/planning/`** (still pending from Pitch 8).
2. **Pitch Roadmap → Pitch 9:** the invite gate is required, not "pending your decision" (pitch §13).
3. **PRD → Accounts acceptance criteria** (pitch §7): add login/logout, profile edits, timezone capture/editing, confirmation before deletion, and "after a password reset every session ends" (R26).
4. **Architecture → Open Questions:** mark settled — invite mechanism (R2), email provider (R15), timezone capture (R11), deletion mechanics (R12/R13). **Architecture → Auth & Identity:** the server uses the service-role key for two admin auth operations (R4); Supabase "secure password change" is on (R27).
5. **Library & Gyms spec / `.env.example` history:** "service-role key never in `src/` or Vercel" is superseded by R4.
6. **`overload-ui-design` skill:** Login guidance ("no sign-up link, no forgot flourish") and single-user wording are stale (R19); its preview template's token block predates the electric-blue brand refresh (the preview re-copied tokens from `globals.css`).
7. **Skills still describe a single-user product** (`overload-spec`, `overload-design-doc`, `overload-ticket-worker`, `overload-review-audit`) — from Pitch 8, still open.
8. **Root `CLAUDE.md`** is single-user and says previews deploy against a dev project; `.claude/CLAUDE.md` governs (Pitch 8 §9, still open). `.claude/CLAUDE.md` names the preview path `-preview.tsx`; the skill and owner feedback say `.html`.
9a. **Password reset removed (R28):** `.claude/CLAUDE.md` still says reset email goes through a custom SMTP provider and that a reset request gets the same response for every email (Stack → Email; Access and registration model; Testing item 6). The pitch, the PRD's Accounts feature and acceptance criteria, and the Roadmap's Pitch 9 still include password reset. They need to say reset is deferred until an email provider is chosen, and that a forgotten password is an owner operator task.
9. **CLAUDE.md "verify on a preview deployment with real-shaped data"** for history-deleting changes: there are no DB-backed previews; the run verified on the local stack, and the runbook §8 proves deletion in production on a throwaway account.

## 8. Outstanding human steps

Follow `docs/runs/09-accounts-signup-login-password-reset-runbook.md` (updated for the reset removal; no email setup remains):

1. **§1 gate:** finish and record the Multi-User Foundation production verification (runbook 08 §7.4). **Not recorded as of this run.**
2. Commit the owner's uncommitted `.claude/CLAUDE.md` (and amend its reset/email lines, §7 item 9a); decide on the root `CLAUDE.md`. (The run never staged it, nor `backup-pre-ownership-20261019-1119.dump` in the repo root — consider moving that backup out of the working tree.)
3. **§2** Auth settings: project signup **OFF**, email provider enabled (it is the login method), min password 6, **secure password change ON**.
4. **§3** Vercel Production: `SUPABASE_SERVICE_ROLE_KEY` (server only). Review **R4** first.
5. **§4** Review and merge #56 (deploys). Move OVE-41, 42, 44, 45 to Done when it merges; decide what to do with OVE-43 (removed).
6. **§5–§6** own-account check, then throwaway-account deletion with before/after counts.
7. **§7** only then: set `OVERLOAD_INVITE_CODE` and redeploy to open invite-only signup. Tell friends there is no self-service reset.
8. **§8** as needed: a forgotten password.

## 9. Open questions (undecidable by the run)

1. **Server-side rate limiting** (spec Open Question 1): login/password checks reach Supabase from Vercel's IPs, so Supabase's per-IP limits are shared. Default: rely on Supabase limits + a long invite code; add a Vercel Firewall rule if abuse appears.
2. ~~**Production sending domain**~~ — moot since R28 (no email is sent).
3. **Multi-User Foundation production status** — the run could not determine it (§8.1).

## 10. Halt conditions

None triggered. The closest call was **stop condition 3 ("touches … the Supabase service-role key")**: the design needs the key at runtime (R3/R4). The run treated writing server code that reads the variable as in scope and **did not touch any production key** — only the local stack's well-known demo key was used. If you read the condition more strictly, R4 is the decision to reverse; the alternative (a Supabase "before user created" hook with a database-held invite secret, plus SQL deletion from `auth.users`) is noted in the spec's reasoning.

## 11. Deferrals

- None from the review. Out of scope by the pitch: onboarding tour, greeting, appearance, mobile nav, What's New, plan seeding, email change, password change from Settings.
