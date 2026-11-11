# Public Landing Page & Changelog — Owner Runbook

**Pitch 21 · repo slug `20-public-landing-page-changelog` · feature PR #121 (open, human approval required)**

This run did **not** touch production. It did not apply a migration there, seed anything, change signup mode, enable billing, or publish the legal pages. Every step below that touches production is yours to do, in order, with the safeguards stated. Steps marked *(blocking)* must be done before merging #121.

---

## 0. Urgent, independent of this pitch: the billing kill switch is not on `main`

`STRIPE_BILLING_ENABLED` / `isCheckoutEnabled()` exists only in commit `cddd220`, which was pushed to `origin/19-plans-billing-promo-codes` **after** PR #112 was squash-merged. `main`, and anything deployed from it, has **no server-side billing switch**.

1. Open production Plan & Billing (`/settings/billing`) as a Free or trial account. If you see **Monthly / Annual subscribe buttons**, production can start a Stripe Checkout with whatever Stripe keys are configured there.
2. This feature branch carries the commit unchanged (`b8f07ad`). Merging #121 brings the switch to `main`. To fix production sooner, cherry-pick `cddd220` onto `main` as its own small PR.
3. Confirm production has `STRIPE_BILLING_ENABLED` unset or `false`. The code only enables checkout for the exact string `"true"`.

## 1. Review and finalize the legal drafts *(blocking for publication, not for merge)*

The supplied drafts are integrated as **reviewable content** in `src/lib/legal/privacy.ts` and `terms.ts`. Production shows a short "being finalized" page until you publish. Preview and local deployments show the full draft under "Draft for owner review — not in effect", with each missing fact highlighted.

### 1.1 Facts only you can supply (`src/lib/legal/facts.ts`, all `null` today)

| Fact | Used in | Notes |
| --- | --- | --- |
| `operatorName` | both | Legal name of the owner or business |
| `contactAddress` | both | Legally sufficient contact address |
| `effectiveDate` | both | The publication date, e.g. "December 1, 2026" |
| `minimumAge` | both | Decide (e.g. 13, 16, 18). **Signup does not enforce any age today.** Decide whether it must, which would be a separate change. |
| `governingLaw` | terms | Liability limit, governing law, disputes. Needs legal review. Don't invent arbitration. |
| `refundPolicy` | terms | Refund and cancellation position. Needs legal review. No blanket "no refunds" without review. |
| `retentionStatement` | privacy | Verified retention for logs, support, billing, and backups. See §1.3. |
| `regionalNotice` | privacy | Transfer notices and rights for your launch regions |
| `creatorDisclosure` | `/blizzy` | An accurate material-connection disclosure (FTC). Until set, the neutral draft shows: "This is a promotion for Overload offered through the creator BLIZZY." |

### 1.2 Reconciliation of the drafts against the code (corrections already made in the reviewable copy)

| Draft said | Code shows | Reviewable copy now says |
| --- | --- | --- |
| Storage is for exercise images | Supabase Storage also holds **feedback screenshots** (bucket `feedback-screenshots`) | Names both |
| Campaign attribution "may" use a short-lived value (owner to confirm) | Cookie `ovl_campaign`, value = campaign + issue time, HttpOnly, SameSite=Lax, **2 h**, cleared on signup. One value, `Profile.signupCampaign`, is kept for the life of the account. | States exactly that |
| Technical info: "verify logging, analytics" | No analytics, pixel, or tracking package exists. Signup and recovery rate limiting stores a **SHA-256 hash of a request fingerprint** (IP, or UA + language) per time window, with **no prune job**. | States the hash and "no analytics, advertising, or tracking tools" |
| Cookies (owner to verify) | Supabase auth cookies, `ovl_campaign`, and localStorage for the appearance preference and dismissed upgrade notes. Turnstile on signup and reset. | Lists each |
| Deletion "intended to remove account-owned records" | `src/lib/accounts/deletion.ts` deletes every owned row in one transaction, including the BillingAccount mirror. It does **not** cancel a Stripe subscription. | Terms: "Deleting your account does not cancel a paid subscription in Stripe. Cancel it from Plan & Billing first." **Decide the real behavior before paid launch** (Pitch 23). |
| Vendors: Supabase, Vercel, Resend, ImprovMX, Turnstile, Stripe | Supabase, Vercel, Turnstile, and Stripe are in code. Resend is in the Public Accounts runbook (Supabase Auth SMTP). **ImprovMX is not verifiable from code.** | Kept as you stated. **Confirm ImprovMX.** |
| Grace period "may continue" | `GRACE_PERIOD_DAYS = 7` (marked owner-confirm in code) | Terms says 7 days. Confirm before live billing. |
| Children under 13 | No age check exists at signup | Policy text keeps "not designed for children…" plus the `minimumAge` fact |
| Health-data obligations (FTC HBNR) | Training records may be health-adjacent | **Not resolved by code. Owner or legal question.** |

### 1.3 Retention facts to verify for `retentionStatement`
Supabase PITR and backup window for your plan. Vercel log retention. Stripe record retention (Stripe's policy). Feedback rows and screenshots, which persist until account deletion. `auth_throttle` rows (no prune). Resend logs. ImprovMX forwarding logs.

### 1.4 To publish (per document)
1. Fill every fact the document uses in `facts.ts`.
2. In `privacy.ts` / `terms.ts`, set `status: "published"` and `approval: { approvedBy: "<you>", approvedOn: "YYYY-MM-DD" }`.
3. Run `npx jest tests/unit/legal-publication.test.tsx`. A published document with any missing fact or no approval **fails the build** by design.
4. Deploy. The page becomes indexable and joins the sitemap automatically.
5. Qualified legal review is strongly advised. Nothing in this run is legal approval.

## 2. Marketing claims: review and approve *(blocking for launch)*

All public copy lives in `src/lib/marketing/copy.ts` (drafts). Claim → evidence → CTA ledger:

| Section | Claim (draft) | Evidence (real synthetic capture) | CTA |
| --- | --- | --- | --- |
| Hero | "You logged the reps. Know what to do next." Reads each logged set against your plan and calls go up / hold / back off. | `today`: Bench "Try 185 lb (+5) · Progress"; Military Press "Deload"; holds untagged | mode CTA |
| Log | Every set kept, editable, shown next time | `logging`: "Last time · Oct 28 · 180 × 8, 8, 8" | none |
| Call (Pro) | "Ready to go up" with the weight and the sets that earned it | `exercise`: "Try 185 lb next time (+5 lb)" plus evidence line | none |
| Gyms | Machine and cable weights tracked per gym; barbells and dumbbells the same everywhere | `gym-northside` 130 lb / `gym-riverside` 160 lb | none |
| Trend (Pro) | e1RM over weeks; deload weeks marked | `trend` | none |
| Plans | Logging free, the call Pro | text (capabilities match `PLAN_CAPABILITIES`; no plan import) | See pricing |
| Won't do | No program writing, coaching, sharing, ads | text (product boundaries) | none |

The banned-phrase, invented-number, and social-proof checks run in CI (`tests/unit/marketing-pages.test.tsx`).

## 3. Screenshots and the demo seed *(engineering done; your image approval pending)*

The images are genuine renders from the **local stack only**. Provenance and the storyboard are in `docs/marketing/screenshot-provenance.md`.

### To recreate them (local only)
1. `npx supabase start`. Export **local** values for every variable (never the repo `.env`, which is production): `DATABASE_URL`/`DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the local anon and service keys from `npx supabase status -o env`, `STRIPE_*` empty, `STRIPE_BILLING_ENABLED=false`, `OVERLOAD_SIGNUP_MODE=public` (local server only), Turnstile test keys `1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`, `DEMO_APP_URL=http://localhost:3100`, `DEMO_EMAIL=<new>@example.test`, `DEMO_PASSWORD=<12+ chars>`.
2. `DIRECT_URL=… npx prisma migrate deploy` (local) and the library import if missing (`npm run db:seed` with local env).
3. `npx next build && npx next start -p 3100` with the same env.
4. `npm run demo:capture -- signup` creates the account through `/signup` and prints its id.
5. `npm run demo:seed -- --user-id <id>` (dry run), then `… --execute --confirm-user <id>`.
6. `npm run demo:capture -- shots`, then update dimensions in `src/lib/marketing/screenshots.ts` if crops change.

The seed **refuses** the production ref `ycxvdiklpefyhdclxyau`, any hosted Supabase host, and any non-loopback DB, before connecting, with no override. It never deletes. A re-run is a no-op, so re-capture on a fresh `*.test` account.

### A production demo account (separate, NOT authorized by this pitch)
The normal tools cannot reach production. If you later want one:
1. Decide in writing: exact target email, whether it is a new account, the rows to create, and a rollback plan.
2. Take a fresh Supabase backup and confirm the PITR window.
3. Create the account through the real production signup (in invite mode with your code). Do **not** reuse a deleted test email via SQL, and do not delete any account to free an email.
4. Write a dedicated operator procedure. It is not `demo:seed`, whose guard refuses production by design. It needs a dry run, explicit `--production --confirm-project ycxvdiklpefyhdclxyau --confirm-user <id>`, one transaction, and a recorded rollback that deletes only that account's fixture rows through the account-deletion module.
5. Never publish its credentials. Public visitors only ever see recordings.

### Navattic / Supademo (optional, separate review)
Before embedding or linking a hosted demo: review vendor terms, cost, and tracking, update the privacy policy's vendor and cookie sections, and keep it anonymous and read-only. Nothing was installed in this run.

## 4. Check the live signup mode and billing state (no changes)
- Vercel → Project → Settings → Environment Variables (Production): read `OVERLOAD_SIGNUP_MODE` (and the legacy `OVERLOAD_SIGNUP_OPEN`). Unset means **closed**. The public pages show the matching CTA automatically.
- Confirm `STRIPE_BILLING_ENABLED` is not `"true"`.
- **Do not change either from this pitch.**

## 5. Test the CTA states without touching production
Use a **local** build (or a preview with its own env) and set the variables there:

| Visitor | `OVERLOAD_SIGNUP_MODE` | `STRIPE_BILLING_ENABLED` | Expect on `/`, `/pricing`, `/blizzy` |
| --- | --- | --- | --- |
| signed out | closed | false | "Sign in" only plus "isn't taking new accounts", no signup link, Pro "Not on sale yet" |
| signed out | invite | false | "Join with an invite code" + invite note; no buy action |
| signed out | public | false | "Create an account" + "14 days of Pro, no card"; no buy action |
| signed out | public | true | Pro card: "Create an account to subscribe" |
| signed in | any | false | "Open Overload"; `/` is Today |
| signed in | any | true | Pro card: "Go to Plan & Billing" (never Checkout directly) |

The automated matrix test covers all 12 combinations (`tests/unit/marketing-routing-cta.test.ts`).

## 6. Mobile browsers (manual, unverified by the run)
On a real iPhone (Safari) and Android (Chrome), check `/`, `/pricing`, `/blizzy`, `/changelog`, `/privacy`:
- no horizontal scroll
- header actions fit
- the Copy button works
- screenshots switch to the phone captures under 640 px
- dark mode shows the dark captures

The run checked 390 px and 1280 px in Chrome only.

## 7. BLIZZY end to end (Stripe **test mode**, preview or local only)
1. Visit `/blizzy` and confirm devtools shows the `ovl_campaign` cookie (HttpOnly, 2 h).
2. Sign up (invite or public test env), then check the account's `profiles.signup_campaign = 'blizzy'` and that the cookie is gone.
3. With `STRIPE_BILLING_ENABLED=true` (test env only), Plan & Billing shows "Have the BLIZZY code? Enter BLIZZY at checkout on the monthly plan." beside **monthly** only.
4. Monthly checkout shows Stripe's promo field and BLIZZY applies (if eligible). Annual checkout shows **no** promo field.
5. A second-time customer or the 201st redemption is refused **by Stripe**. Overload never authorizes it.
6. The month-2 and month-3 coupon behavior is still the Pitch 20 / Pitch 23 launch test.

## 8. Attribution privacy (your decision)
- **Kept:** one enum value on the account, written once at signup, exported, and deleted with the account. Admin sees only an aggregate count.
- **Cookie:** 2 h, first-party, campaign name + timestamp only. This is a Bucket C guess. Shorten or lengthen in `CAMPAIGN_TTL_SECONDS`.
- Decide whether the lifetime retention of `signupCampaign` is acceptable, and keep the privacy policy text in step.

## 9. Production migration *(blocking before merge deploys)*
`prisma/migrations/9k_signup_campaign` is additive: a new enum plus a nullable column on `profiles`, which already has deny-all RLS. **Apply it before or with the deploy.** The new signup code writes the column, so signup would fail without it.
1. Take a fresh production backup (Supabase dashboard) and note the time.
2. From a trusted machine: `DIRECT_URL=<production direct URL> npx prisma migrate status`. Confirm only `9k_signup_campaign` is pending.
3. `DIRECT_URL=<production direct URL> npx prisma migrate deploy`.
4. Verify: `\d profiles` shows `signup_campaign signup_campaign NULL`, and RLS is still enabled on `profiles`.
5. Rollback (only if nothing has written it yet): `ALTER TABLE profiles DROP COLUMN signup_campaign; DROP TYPE signup_campaign;` and delete the `_prisma_migrations` row. Once signups have written values, prefer rolling the code back and leaving the column.

## 10. Before merge
- Re-date the provisional release notes to the production ship day (entry `2026-11-04-public-changelog` and the earlier provisional ones, per their comments).
- Review the public changelog content. Every entry is public by contract, and a CI scan blocks emails, URLs, and internal terms.
- Verify `www.overloadtraining.app` canonical and robots after deploy: view-source shows `<link rel="canonical" href="https://www.overloadtraining.app/…">`, `/robots.txt` allows the public pages and disallows the rest, and `/sitemap.xml` lists the public pages only.

## 11. Rollback
Revert the merge commit of #121. Public pages disappear, and `/` returns to redirecting signed-out visitors to `/login`. The `signup_campaign` column can stay; it is harmless. No data migration is involved.

## 12. What remains for Pitch 23
- Web-first launch criteria given the iOS postponement (the roadmap still lists iPhone checks).
- Deletion vs. an active Stripe subscription (§1.2).
- The machine "Stay at" weight anchored to the gym baseline (15% margin) can lag the latest logged weight. Seen while building the demo (`docs/marketing/screenshot-provenance.md`). Decide whether that is intended.
- Legal review sign-off, creator disclosure, and age enforcement.
- Mobile-browser checks (§6) and the full landing → signup → checkout → first workout journey.
