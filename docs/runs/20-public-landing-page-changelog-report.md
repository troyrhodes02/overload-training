# Public Landing Page & Changelog — Run Report

**Pitch 21 · repo slug `20-public-landing-page-changelog` · run date 2026-11-04 · unattended (Autonomous Pipeline Policy)**

- **Feature branch:** `20-public-landing-page-changelog` · **Feature PR:** #121, **open and NOT merged** (stop before merge, per the run prompt)
- **Linear:** milestone *Public Landing Page & Changelog* (Overload V1); tickets **OVE-96 to OVE-103**, all In Review
- **Ticket PRs:** #122–#129, all integrated into the feature branch (§2)
- **Halt condition:** none hit. The run stopped at the planned human-review gate.

---

## 1. What shipped (on the feature branch)

| Ticket | Delivered |
| --- | --- |
| OVE-96 L1 | Signed-out `/` is **rewritten** to the landing page (`/welcome`, URL stays `/`); signed-in `/` stays Today. Marketing pages and robots/sitemap/manifest are public. `resolveCta` covers 12 combinations (fail-closed, no waitlist, no subscribe action while billing is off). Marketing header and footer, skip link. Canonical host `https://www.overloadtraining.app`. |
| OVE-97 L2 | `/changelog` renders the **same** release-note catalog through the same `ReleaseNote` component as What's New. CI public-safety scan. Settings footer: Changelog · Privacy · Terms. |
| OVE-98 L3 | Landing (hero concept A + seven claim → evidence sections) and pricing (Free first; $4.99 / $39.99; "Not on sale yet" while billing is off; billing on routes to Plan & Billing, never to Checkout). One copy module, banned-phrase and truth checks. |
| OVE-99 L4 | `/blizzy` (code + Copy, five conditions, billing-aware availability, draft creator disclosure under the offer). First-party `ovl_campaign` cookie (2 h, HttpOnly, Lax, allowlisted name + issue time). **Migration `9k_signup_campaign`**: `Profile.signupCampaign`, written once at signup from the server-read cookie. Plan & Billing BLIZZY reminder (monthly only, when Subscribe exists). Admin aggregate "Signed up via /blizzy". |
| OVE-100 L5 | Demo fixture `demo-v1` (about 8 weeks, two blocks, two fictional gyms). Guarded seed CLI: dry run by default, loopback only, production-ref and hosted-Supabase hard refusal before connecting, no override, never loads `.env`, empty-or-fingerprint idempotency, no delete path, writes only through the app's write modules. |
| OVE-101 L6 | **24 genuine screenshots** of the seeded synthetic account on the **local** stack (light/dark × desktop/phone, 5 storyboard steps), wired into the landing with provenance. The capture script creates the demo account through the app's own `/signup`. |
| OVE-102 L7 | `/privacy` and `/terms` from the owner's drafts as typed content with **owner-fact tokens** (all null). Three-state gate: published / draft-preview (non-production) / finalizing (production). A premature "published" fails the build. Unpublished pages are noindex. Drafts reconciled against the code. |
| OVE-103 L8 | One non-significant What's New entry ("Overload's changelog is now public"); no tour step, with the reason recorded. |
| (precondition) | **Owner's billing kill switch `cddd220` cherry-picked unchanged** (`b8f07ad`); see §8.1. |

Artifacts: `pitches/20-…md` plus appendices A/B/C (verbatim owner inputs), `docs/design/20-…-design-doc.md`, `docs/previews/20-…-preview.tsx`, `docs/specs/20-…-spec.md` (RD-1…RD-23), `docs/runs/20-…-runbook.md`, `docs/marketing/screenshot-provenance.md`.

## 2. Integration (step 10)

#122 and #123 were squash-merged on GitHub. GitHub then refused #124 (an add/add conflict: squash merges drop the stacked branches' ancestry). Because force-pushing is a stop-condition operation, #124–#129 were **squash-merged locally in issue order** (`git merge --squash -X theirs`, one commit per ticket, titled "(#N)") and pushed normally. Each ticket PR was then closed with a comment pointing to its squash commit. One stray file (`scripts/demo/provision-local.ts`, deleted in OVE-101) survived; it was removed, and the feature tree was verified **byte-identical** to the last ticket's tip (0-line diff).

## 3. Decisions made on the owner's behalf

All are recorded in spec §17 (RD-1…RD-23). The notable ones:

- **RD-1** Stem `20-…`, because repo numbering is roadmap − 1 since the iOS postponement.
- **RD-3** Carried the owner's kill switch onto this branch (§8.1).
- **RD-4** Rewrite, not redirect, for signed-out `/`.
- **RD-7** BLIZZY handoff is a copyable code plus Stripe's own promo field. Nothing is pre-applied, because checkout uses `allow_promotion_codes` (monthly only) and pre-applying would change billing semantics. **Limitation:** the lifter types the code at Stripe.
- **RD-8** Cookie life **2 h** (*Bucket C guess, flagged*).
- **RD-9** `signupCampaign` is kept for the account's life (*owner privacy item*).
- **RD-11** Every release note is public by contract. No filter flag, plus a CI scan.
- **RD-13** Neutral draft creator disclosure until the owner supplies one.
- **RD-16/17** Seed is loopback-only and uses the app's write modules (the old dev-seeding branch was not reused).
- **RD-18 (amended)** The demo account is created through the real `/signup` page instead of the admin-API helper.
- **Fixture:** no goals (`createGoal` opens its own transaction, so it can't join the single seed transaction). The hold example is **Incline Dumbbell Press**, not Seated Cable Row as the L5 ticket text said: a free weight keeps the call global and avoids per-gym scoping.
- **Footer** shows "© Overload" without a year (a request-time year would defeat static rendering).

Bucket C numeric guesses for review: cookie TTL 7200 s; future-skew tolerance 60 s; "about $3.33 a month" display.

## 4. Verification (actually run)

Final numbers are on the feature branch after the review-audit fixes.

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run format:check` | pass |
| Unit (`jest.config.js`) | **102 suites, 1576 passed, 0 failed** |
| Integration (`jest.integration.config.js`, embedded Postgres) | **67 suites, 719 passed, 0 failed** (final, post-audit) |
| `next build` | exit 0. The first invocation each time exits on the pre-existing Next.js `SecurityFatalError` advisory nudge; the immediate retry exits 0 (same as earlier pitch reports). |
| `npm run verify:client-bundle` | OK: no server secret in `.next/static` |
| Live local checks (production build, local stack) | signed-out `/` serves the landing; `/blizzy` sets `ovl_campaign` (no `Secure` on http, as designed); `/plan` → 307 `/login`; `/pricing` "Not on sale yet"; `/terms` noindex; non-production robots disallow all |
| Visual vs preview | landing, pricing, `/blizzy`, changelog, privacy at 1280 and 390, light and dark (Chrome, local) |

### 4.1 Integration
The pre-audit full run was 67 suites, 718/719. The one failure was an admin Overview exact-DTO assertion that didn't know the new `fromBlizzy` field. It was fixed and that suite passes (16/16). 

### 4.2 Final integration run
After the review-audit fixes, on the integrated feature branch: **67 suites, 719 passed, 0 failed** (exit 0).

### Not run / unverified (honest list)
- **Native iOS or Android:** not attempted, not claimed (web-only by owner decision).
- **Real mobile Safari or Chrome:** not run (runbook §6). Only Chrome desktop at 390 and 1280 widths.
- **Real Stripe test-mode checkout with BLIZZY**, including month-2/3 coupon behavior: not run (runbook §7).
- **Production canonical, robots, sitemap on the live host:** not run (runbook §10).
- **Production migration:** not run (human step, runbook §9).

## 5. Review and audit

`/code-review` posted 10 inline findings on #121. `/overload-review-audit` dispositions (PR comment on #121):

- **Implemented (7):**
  1. robots now allows asset prefixes
  2. per-request memoized marketing context
  3. and 4. one `<picture>` per frame with dimensioned sources (no double download, no phone layout shift)
  5. no campaign cookie on in-app or same-origin navigation (inflated attribution)
  6. rewrite forwards refreshed request cookies
  7. BLIZZY code and cap from config
  9. capture script cleanup on error
- **Decided (1):** 8, the provisional release-note date (established convention; re-date at merge).
- **Deferred (1):** 10, the seed emptiness check outside the transaction (single-operator loopback tool; worst case is a doubled local demo history).

Regression tests were added for 1, 3/4, and 5.

## 6. Near-misses and things caught

- **Billing kill switch missing from `main`** (§8.1).
- **Admin Overview exact-DTO test** was not run at the ticket level (OVE-99 ran admin-privacy and admin-foundation, not admin-accounts). It was caught by the feature-level full suite and fixed.
- **Guards did their job:** `deliberate-absences` caught the word "recommended" in a legal comment (reworded). `release-notes-guards` ("nothing sends email") flagged the privacy policy naming Resend. That file got a narrow exemption plus a **new** assertion that it imports only types.
- **First screenshot pass** had the app's side rail shrinking the product, a loading skeleton on the logging card, and a dark "Resume workout" Today shot. Fixed with column cropping, waiting for "Last time", and two-phase capture on a fresh account.
- **`prisma.config.ts` loads `.env` (production)** but does not override exported variables. Every DB command in this run exported the local stack explicitly, and the demo tools never load `.env`.
- Local-only side effects: the local Supabase DB was migrated `9h`→`9k`, and several `*.test` demo accounts plus one orphan auth user (from the abandoned admin-API helper) exist **on the local stack only**. Nothing touched production.

## 7. Demo seed, safety tests, screenshot provenance, storyboard

- **Command:** `DATABASE_URL=<loopback> npm run demo:seed -- --user-id <id>` (dry run) → `… --execute --confirm-user <id>`. Full recipe in runbook §3.
- **Safety tests:**
  - `tests/unit/demo-seed-guard.test.ts` (33): production ref in every guarded variable and form, hosted Supabase, non-loopback, missing URL, no override flags, explicit target and confirmation, static invariants (no direct `LoggedSet` write, no delete, raw write, or dotenv, guard before DB imports).
  - `tests/integration/demo-seed.int.test.ts` (8): inspection writes nothing, exact counts, idempotent re-run, conflict refused, other accounts untouched, the unchanged engine reads Progress / Deload / hold, distinct per-gym machine baselines, no missed day.
- **Real run (local):** dry run EMPTY → seeded 32 workouts / 264 sets in one transaction → re-run "Already seeded … Nothing written."
- **Provenance:** `docs/marketing/screenshot-provenance.md` plus `src/lib/marketing/screenshots.ts` (synthetic, `demo-v1`, anchor and capture date 2026-11-04, route per image).
- **Storyboard (5 steps):** Today → logging card → the call and its evidence → one machine at two gyms → e1RM trend.

## 8. Required upstream amendments and owner items

1. **Kill switch.** `cddd220` was never merged to `main`. Production may be showing Subscribe buttons with no server switch. Check now (runbook §0).
2. **Roadmap vs iOS postponement:** the dependency map still puts Pitch 18 (iOS) upstream of 19–21, and Pitch 23's checklist names iPhone checks. An owner decision on web-first launch criteria is needed.
3. **PRD gaps:** the PRD's Landing section doesn't list legal-publication, creator-disclosure, minimum-age, or attribution-retention criteria. CLAUDE.md's Storage invariant ("only exercise images") is stale: feedback screenshots live there too.
4. **Release-note schema vs pitch:** no change was needed (the catalog was already public-safe). The pitch's "public-safe filtering" is met by contract plus a CI scan, not a flag.
5. **Production migration needed:** `9k_signup_campaign` must be applied before or with the deploy (runbook §9). Signup or billing behavior changed only by adding provenance and a display-only reminder. Signup mode, billing switch, prices, and eligibility are unchanged.
6. **Legal:** facts, approval, and legal review (runbook §1). Deletion does **not** cancel a Stripe subscription; decide before paid launch.
7. **Existing behavior found:** a machine's "Stay at …" weight follows the gym baseline (15% margin) and can lag the latest logged weight.

## 9. Claims audit and CTA matrix
The claim → evidence ledger is in runbook §2 and the CTA matrix in runbook §5. Both are enforced by tests (`marketing-pages.test.tsx`, `marketing-routing-cta.test.ts`).

## 10. Attribution privacy
First-party only. No third-party script, pixel, or analytics. The cookie holds the campaign name and issue time, lasts 2 h, and is HttpOnly and SameSite=Lax. It is set only on an arrival from outside and spent at signup. The server keeps one enum value per account (exported, deleted with the account, admin sees only an aggregate). **Owner decision:** retention for the account's life, and the cookie TTL.

## 11. Human steps (merge, production, Pitch 23)
1. Review #121 and the runbook.
2. Check the kill switch on production (§0).
3. Apply migration `9k` with a backup.
4. Re-date the provisional release notes.
5. Merge.
6. Verify canonical, robots, and sitemap on the live host.
7. Approve marketing copy and screenshots.
8. Fill legal facts and publish when approved.
9. Pitch 23: web-first launch decision, the deletion/subscription decision, a real-device pass, and the full landing → checkout journey.

**Do not** enable public signup or live Stripe as part of this pitch.

## 12. How to resume
If anything below is unchecked, see `docs/runs/20-public-landing-page-changelog-progress.md`. The only remaining human action in this pipeline is the merge gate on #121.
