# Public Landing Page & Changelog — Run Progress

**Working slug:** `20-public-landing-page-changelog` · **Roadmap #:** 21 · **Repo seq:** after Plans, Billing & Promo Codes (repo 19)
**Why this stem:** repo numbers = roadmap − 1 since iOS Foundation (roadmap 18) was postponed (18-public-accounts = roadmap 19; 19-plans-billing = roadmap 20). No prior pitch/design/spec/milestone existed (checked `pitches/`, `docs/`, Linear Overload V1, 2026-11-04).
**Linear project:** Overload V1 · **Feature branch:** `20-public-landing-page-changelog` (from `main` @ 4fff62e)
**Merge behavior:** STOP BEFORE MERGE — feature PR left open for human approval (run prompt).
**Never:** production Supabase `ycxvdiklpefyhdclxyau` (the repo `.env` points at it — override every DB var to the local stack 127.0.0.1:54321/54322 or use embedded Postgres), enabling signup or live billing, publishing legal drafts as approved.

## Stage status
- [x] 1. Pitch — created `pitches/20-public-landing-page-changelog.md` + appendices A (demo seed), B (privacy draft), C (terms draft), verbatim from run prompt
- [x] 2. Design doc — `docs/design/20-public-landing-page-changelog-design-doc.md` (v1.0; hero concept A chosen)
- [x] 3. UI preview — `docs/previews/20-public-landing-page-changelog-preview.tsx` (3 hero concepts, all CTA states, legal states, pending frames)
- [x] 4. Spec — `docs/specs/20-public-landing-page-changelog-spec.md`
- [x] 5. Resolved Decisions in spec (RD-1…RD-23; OQ-1…7 owner items)
- [x] 6. Linear milestone `Public Landing Page & Changelog` (2b1a45fa) + OVE-96…103 chained
- [x] 7. Feature PR opened: **#121** (DO NOT MERGE)
- [ ] 8. Implement tickets (stacked branches) ← IN PROGRESS
- [ ] 9. Runbook
- [ ] 10. Integrate ticket PRs into feature branch
- [ ] 11. Verification
- [ ] 12. /review → PR comments
- [ ] 13. /overload-review-audit
- [ ] 14. Final verification, STOP before merge
- [ ] 15. Run report

## Discovery facts (load-bearing)
- **Kill switch missing on `main`.** `STRIPE_BILLING_ENABLED` / `isCheckoutEnabled()` exists only in commit `cddd220` on `origin/19-plans-billing-promo-codes`, pushed after PR #112 was squash-merged. Cherry-picked onto this feature branch as `b8f07ad` (owner-authored, unchanged). REPORT TO OWNER: production deployed from `main` has no server-side billing switch.
- Signup mode: `src/lib/accounts/signup-gate.ts` `signupMode()` → closed|invite|public (env `OVERLOAD_SIGNUP_MODE`, alias `OVERLOAD_SIGNUP_OPEN`; unset → closed). Production value not readable from here (no Vercel CLI); CTA logic covers all three.
- Signup signs the user in immediately (`createConfirmedUser` + signIn) → `establishProfile` creates Profile + trial Entitlement + TourProgress + ReleaseSeen.
- Checkout: `startCheckout` (email-verified gate) → Stripe hosted Checkout, `allow_promotion_codes` only on monthly. No pre-applied discount path → BLIZZY handoff = displayed copyable code + Stripe's own promo field (decision 5 fallback).
- Release notes: `src/lib/release-notes/{entries,catalog,types}.ts` are pure, public-safe by contract (spec 12 R21); `ReleaseNote` component reusable.
- Routing: `src/proxy.ts` + `src/lib/auth-routes.ts` (pure). `/` is Today inside `(app)` (requireAccount). Signed-out `/` currently → /login. Matcher excludes only image extensions, so `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` currently redirect signed-out visitors to /login.
- `cacheComponents: true` → request-time reads need `connection()`/Suspense.
- Account deletion deletes the BillingAccount mirror but does NOT cancel a Stripe subscription (Terms draft discrepancy).
- Feedback screenshots live in Supabase Storage bucket `feedback-screenshots` (privacy draft says Storage = exercise images only — discrepancy).
- No analytics/tracking packages in the repo.
- Local Supabase stack running in Docker (`supabase_*_overload` containers) → isolated env for demo seed + real screenshots.
- Prior dev-seeding branch `chore/dev-scenario-seeding` predates multi-user and writes LoggedSet directly → NOT reused; demo seed uses app write modules (`startOrResumeWorkout` accepts historical `scheduledFor`, `logSet`, `completeWorkout`).

## Resolved Decisions
See spec §17 (RD-1…RD-23). Key: RD-3 cherry-pick kill switch; RD-4 signed-out `/` → rewrite `/welcome`; RD-7 BLIZZY = copyable code + Stripe promo field; RD-8 `ovl_campaign` 2h cookie; RD-9 `Profile.signupCampaign` enum (migration 9k); RD-12 legal 3-state gate; RD-16 seed loopback-only, prod-ref refusal.

## Linear issue IDs (milestone 2b1a45fa)
- OVE-96 L1 — Public routing, marketing frame & truthful CTAs
- OVE-97 L2 — Public changelog + Settings links (blockedBy 96)
- OVE-98 L3 — Landing & pricing (blockedBy 97)
- OVE-99 L4 — /blizzy + first-party attribution (+ migration 9k) (blockedBy 98)
- OVE-100 L5 — Demo fixture + guarded seed CLI + tests (blockedBy 99)
- OVE-101 L6 — Real screenshots + storyboard (blockedBy 100)
- OVE-102 L7 — Privacy & Terms behind publication gate (blockedBy 101)
- OVE-103 L8 — User guidance release note (blockedBy 102)

## Ticket branches / PRs
(stacked: each branches from the previous ticket branch; first from the feature branch)
- [x] OVE-96 → `ove-96-public-routing-frame` → PR #122 (base feature). typecheck/lint/format/unit 1442/build(retry exit 0) green. Note: ran `npm install` (stripe was missing locally) + `prisma generate`; lockfile churn reverted.
- [x] OVE-97 → `ove-97-public-changelog` → PR #123 (base ove-96). unit 1459, build exit 0.
- Build note: first `next build` exits on pre-existing Next.js SecurityFatalError nudge; immediate retry exits 0. Always override DATABASE_URL/DIRECT_URL/NEXT_PUBLIC_SUPABASE_URL to local for builds.
