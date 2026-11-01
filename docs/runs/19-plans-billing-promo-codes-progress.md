# Plans, Billing & Promo Codes — Run Progress

**Working slug:** `19-plans-billing-promo-codes` · **Roadmap #:** 20 · **Revised seq:** after Public Accounts (repo pitch 18)
**Linear project:** Overload V1 (P-OVE-1) · **Pitch doc:** Linear doc e152530b-ffc4-45e8-892c-d7f2da983b93 (copied to `pitches/19-plans-billing-promo-codes.md`)
**Merge behavior:** STOP BEFORE MERGE — leave final feature PR open for human approval.
**Stripe:** TEST MODE ONLY. No live keys, no real charges, no prod migrations, no public-signup activation.

## Stage status
- [x] 1. Pitch retrieved + read (Linear doc; saved to repo `pitches/19-...md`)
- [x] 2. Design doc — `docs/design/19-plans-billing-promo-codes-design-doc.md` written
- [x] 3. UI preview — `docs/previews/19-plans-billing-promo-codes-preview.tsx` written (20 screen/state variants + both appearances)
- [x] 4. Spec — `docs/specs/19-plans-billing-promo-codes-spec.md` written
- [x] 5. Resolved Decisions recorded in spec (RD-1…RD-15)
- [x] 6. Linear tickets OVE-89…95 created + blockedBy chain + User Guidance (B7)
- [x] 7. Feature PR opened → main: **PR #112** (DO NOT MERGE)
- [ ] 8. Implementation — `/overload-ticket-worker` per ticket  ← IN PROGRESS
  - [x] B1 OVE-89 — branch `ove-89-entitlement-foundation` → PR #113. typecheck/lint/format/unit(23)/integration(billing+deletion+ownership-enforce) green; build compiles (pre-existing Next security nudge exits nonzero). Added `plan_required` ErrorCode; billing models in export + ACCOUNT_DELETION_ORDER.
  - [x] B2 OVE-90 — branch `ove-90-capability-gating` (stacked on B1) → PR #114. Query-layer gate (gate.ts) withholds Pro fields + `locked`; UpgradeNote wired on card/Today/day-complete/exercise page. typecheck/lint/format/build-compile green; unit 1348 pass (gate 6); integration billing-gating (AC-2) + 106 progression/history regression pass. Test accounts default to Pro (comp) via `createTestAccount`/`defaultAccount` + `grantTestPro`; billing/gating suites opt to `entitlement:"none"`. Meta-tests (account-scope, ownership-backfill, export coverage) updated for the 3 owned + WebhookEvent.
  - [x] B3 OVE-91 — branch `ove-91-stripe-checkout` (stacked on B2) → PR #115. `stripe@23.1.0`; adapter `stripe.ts` (injectable BillingProvider, `accountId` not `userId`), `checkout.ts` (email-verify gate RD-11), `screen.ts` (BillingScreenDto), `/settings/billing` page+actions, `plan-billing.tsx`, Settings row. typecheck/lint/format/build-compile/client-bundle green; billing-checkout unit (5) + full unit suite **1353 pass**. Guard allowlists updated (emailVerifiedAt→checkout.ts+screen.ts). Live Stripe round-trip = UNVERIFIED (test-mode keys + browser; runbook).
  - [ ] B4 OVE-92 — webhook/mirror/grace/BLIZZY
  - [ ] B5 OVE-93 — admin comp + billing visibility
  - [ ] B6 OVE-94 — founding-member operator script
  - [ ] B7 OVE-95 — user guidance

NOTE (pre-existing, not a feature defect): `next build` exits non-zero on a Next.js security-advisory nudge (pitch-18 report §7). Compilation succeeds. Do NOT run the framework security upgrade in this run (cross-cutting, not in this pitch). Record in report for the owner.
- [ ] 9. Runbook
- [ ] 10. Integrate ticket PRs into feature branch
- [ ] 11. Verification (+ adversarial)
- [ ] 12. Code review — `/review`
- [ ] 13. Review audit — `/overload-review-audit`
- [ ] 14. Final verification + STOP BEFORE MERGE
- [ ] 15. Run report

## Authoritative data model (architecture.md)
- **Entitlement** — per account: plan + source (trial|subscription|comp), start/end dates; comp has reason + grantedBy. Current entitlement computed from records.
- **BillingAccount** — per account: Stripe customer ref + read-only mirror of subscription state, written only from verified Stripe events.
- **PromoRedemption** — mirror of a promo code redeemed by an account, from Stripe events.
- **WebhookEvent** — id + type of each Stripe event, so replay changes nothing.
- Capabilities (not plan names) checked server-side. Free never receives Pro result. Capture/history/export never gated.

## Pre-resolved decisions (from run prompt — approved authority)
Free=capture; Pro=interpretation. 14-day card-free trial from signup. Founding members = comp. Prices: $4.99/mo, $39.99/yr (test-mode). BLIZZY = 50% off first 3 months monthly, 200 cap, first-time only. 7-day grace. Stripe test mode. Email verified before first checkout. Admin extends only with comp controls + read-only Stripe mirror.

## iOS postponement override (this run only)
Web-first. No Capacitor/Xcode/StoreKit/Universal Links/native adapters. Do NOT invoke /overload-cross-platform. Record upstream amendments in report (do not edit planning docs).

## Linear issue IDs (milestone "Plans, Billing & Promo Codes" 4da1d8ad)
- OVE-89 B1 — Entitlement schema, resolver & trial foundation (blocks all)
- OVE-90 B2 — Capability gating of Pro surfaces + upgrade note (blockedBy 89)
- OVE-91 B3 — Stripe adapter, Checkout + Portal, Plan & Billing screen (blockedBy 90)
- OVE-92 B4 — Webhook handler, subscription mirror, grace & BLIZZY (blockedBy 91)
- OVE-93 B5 — Admin comp controls & read-only billing visibility (blockedBy 92)
- OVE-94 B6 — Founding-member operator script (blockedBy 89; human-run in prod)
- OVE-95 B7 — User Guidance tour step + What's New (blockedBy 90,91,93)
Build order: 89 → 90 → 91 → 92 → 93 → (94 any time after 89) → 95 last.

## Branches / PRs
- Feature branch: `19-plans-billing-promo-codes` → feature PR (targets main) — STOP BEFORE MERGE
- Ticket branches: each off its predecessor; squash-merge into feature branch in dep order.

## Resolved Decisions
(see spec ## Resolved Decisions — mirrored here at each boundary)

## Deferrals / Open questions
(to be captured)
