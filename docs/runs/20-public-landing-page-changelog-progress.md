# Public Landing Page & Changelog — Run Progress

**Working slug:** `20-public-landing-page-changelog` · **Roadmap #:** 21 · **Repo seq:** after Plans, Billing & Promo Codes (repo 19)
**Why this stem:** repo numbers = roadmap − 1 since iOS Foundation (roadmap 18) was postponed (18-public-accounts = roadmap 19; 19-plans-billing = roadmap 20). No prior pitch/design/spec/milestone existed (checked `pitches/`, `docs/`, Linear Overload V1, 2026-11-04).
**Linear project:** Overload V1 · **Feature branch:** `20-public-landing-page-changelog` (from `main` @ 4fff62e)
**Merge behavior:** STOP BEFORE MERGE — feature PR left open for human approval (run prompt).
**Never:** production Supabase `ycxvdiklpefyhdclxyau` (the repo `.env` points at it — override every DB var to the local stack 127.0.0.1:54321/54322 or use embedded Postgres), enabling signup or live billing, publishing legal drafts as approved.

## Stage status
- [x] 1. Pitch — created `pitches/20-public-landing-page-changelog.md` + appendices A (demo seed), B (privacy draft), C (terms draft), verbatim from run prompt
- [ ] 2. Design doc — `docs/design/20-public-landing-page-changelog-design-doc.md`
- [ ] 3. UI preview — `docs/previews/20-public-landing-page-changelog-preview.tsx`
- [ ] 4. Spec — `docs/specs/20-public-landing-page-changelog-spec.md`
- [ ] 5. Resolved Decisions in spec
- [ ] 6. Linear milestone + tickets + blockedBy chain
- [ ] 7. Feature PR opened (DO NOT MERGE)
- [ ] 8. Implement tickets (stacked branches)
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

## Resolved Decisions (running list; copied into spec)
(see spec once written)

## Linear issue IDs
(none created yet)
