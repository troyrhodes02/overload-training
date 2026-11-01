# Run Report — Plans, Billing & Promo Codes

**Feature:** Plans, Billing & Promo Codes (roadmap **Pitch 20**; working slug/number **19** after the owner-authorized iOS-Foundation postponement)
**Phase:** MVP 4 — Commercial Launch & Operations
**Run date:** 2026-11-01
**Linear:** project Overload V1 (`P-OVE-1`), milestone "Plans, Billing & Promo Codes" (`4da1d8ad`), tickets **OVE-89…OVE-95**
**Feature branch:** `19-plans-billing-promo-codes` → **PR #112** (targets `main`)
**Final status:** ✅ Implemented, reviewed, audited, verified. **PR #112 is OPEN and unmerged, awaiting human approval** (mandatory merge gate — money, subscriptions, entitlements, access controls). Stripe used in **test mode only**; no live keys, no real charge, no production migration, no public-signup activation.

---

## 1. What shipped

A complete, web-only Free/Pro commercial entitlement + billing system, delivered as 7 tickets stacked and integrated into the feature branch:

| Ticket | PR | What |
| --- | --- | --- |
| **OVE-89** B1 | #113 | Migration `9j_plans_billing`: `Entitlement`, `BillingAccount`, `PromoRedemption` (owned) + `WebhookEvent` (un-owned); 5 enums; `AdminAuditAction` += `comp_granted`/`comp_revoked`; deny-all RLS + ownership triggers; partial unique indexes (one trial, one active comp). `src/lib/entitlements` resolver (pure `computeEntitlement` + request-cached `resolveEntitlement`, `capabilitiesFor`/`can`/`requireCapability`→`plan_required` 402). 14-day card-free trial created at signup. Billing models added to `ACCOUNT_DELETION_ORDER` + the export. |
| **OVE-90** B2 | #114 | Server-side capability gating in the **query layer** (`gate.ts`): `getPlannedProgression`/`getOccurrenceProgression`/`getSessionProgressionSummary`/`getExerciseHistory` withhold Pro fields + set a `locked` marker. `UpgradeNote` client component (one quiet dismissible line) on the exercise card, Today list, day-complete, exercise page. |
| **OVE-91** B3 | #115 | `stripe@23.1.0`; `src/lib/billing/stripe.ts` adapter (injectable `BillingProvider`); `checkout.ts` (`startCheckout`/`startPortal`, email-verify-before-checkout gate); `screen.ts` (`BillingScreenDto`); `/settings/billing` page + `PlanBilling` island; Settings sub-label. |
| **OVE-92** B4 | #116 | `POST /api/stripe/webhook` (signature verify → 400 on bad) + `src/lib/data/billing-webhook.ts` reconciler (dedupe by event id; reconcile to re-fetched Stripe truth; 7-day grace; promo mirrored once; account from stored customer id, never the payload). |
| **OVE-93** B5 | #117 | Admin gate extended (entitlement + billing records only; Entitlement writable for comp, mirror read-only). `grantComp`/`revokeComp` (owner-only, audited in one tx, never touches Stripe), `getAccountBilling`, `getBillingOverview` (comps counted separately). Account-page entitlement section + grant/revoke dialogs; `/admin/billing` page + nav. |
| **OVE-94** B6 | #118 | `scripts/operator/founding-members/{grant,cli}.ts` — human-run comp grant to existing accounts (dry-run default, create-only, one tx, idempotent, host-guarded). `npm run founding-members:grant`. |
| **OVE-95** B7 | #119 | User guidance: tour step `plan-billing` (Settings row) + a significant "Introducing Free and Pro" What's New entry (shipped-behavior-only). |

Pipeline artifacts: `pitches/19-…md`, `docs/design/19-…-design-doc.md`, `docs/previews/19-…-preview.tsx` (20 screen/state variants), `docs/specs/19-…-spec.md` (RD-1…RD-15), `docs/runs/19-…-{runbook,progress,report}.md`.

## 2. Capability mapping (RD-1)

Named capabilities (checked server-side, never a plan name): `progression_insights` (progress/hold/deload call, evidence, suggested load, stall gate, RIR qualifiers), `e1rm_trends` (e1RM/weight trend + best-e1RM estimate record), `exercise_history_intelligence` (per-session calls + rep-record frontier), `plan_import` (reserved for the later pitch, unused). **Free → {} ; Pro → all four.** Free-visible always: plan building, logging, RIR entry, cardio, full basic history + corrections, goals + progress, export, deletion, support, the reps trend, heaviest/best-set records.

## 3. Entitlement behavior

Effective plan is computed on read from `Entitlement` rows (trial, comp — Overload-owned) plus the `BillingAccount` Stripe mirror (subscription). Pro if any source is currently valid; expiry of one source never revokes another. Trial = 14 days from signup, pure date math (no job). Subscription→Pro: active/trialing Pro; `cancelAtPeriodEnd` Pro until period end; `past_due` Pro until `graceEndsAt` (= first past_due + 7 days); canceled/unpaid/etc. → Free. A comp is never represented or counted as a paying subscriber. No training data is ever deleted or altered by any transition.

## 4. Decisions made on the owner's behalf (Resolved Decisions)

Recorded in full in the spec's `## Resolved Decisions` (RD-1…RD-15). Headlines: entitlement stored as trial+comp rows with subscription in the mirror (RD-2); enforcement in the query/read layer + `requireCapability` (RD-9); webhook idempotency via event-id ledger + reconcile-to-Stripe-truth (RD-6); BLIZZY = Stripe repeating coupon + promotion code, month-count verified in test mode not invented (RD-7); grace 7 days (RD-5, owner-confirm); tax behind `STRIPE_TAX_ENABLED` default off (RD-12); founding members via a human-run operator script (RD-10); email-verify checkout gate added to the Public-Accounts static-guard allowlist deliberately (RD-11); `WebhookEvent` un-owned + webhook handler in the data layer as the one sanctioned cross-account raw-Prisma writer (RD-14).

Two implementation-time decisions worth flagging: (a) **test accounts default to Pro via an open-ended comp** (`createTestAccount`/`defaultAccount`), mirroring the pre-billing world so the existing progression/history suites keep seeing real results; isolation/gating/plan suites opt out with `entitlement:"none"`. (b) the Stripe adapter carries the account id as **`accountId`** (not `userId`) to satisfy the account-isolation lexical guard outside the data layer.

## 5. Code review (Stage 12) and audit dispositions (Stage 13)

Four finder angles (correctness, security/invariants, removed-behavior+cross-file, CLAUDE.md conventions+altitude) ran against the feature diff; findings posted to PR #112. **Security and conventions reviews were clean** — account isolation, server-enforced Pro (no Free-gets-Pro), webhook signature+idempotency, account-from-customer-id, no card data, admin boundary, deny-all RLS all verified. Four actionable findings, all **VALID + IN_SCOPE → IMPLEMENTED** with regression tests:

| # | Finding (sev) | Fix |
| - | --- | --- |
| 1 | **HIGH** — comp audit entries crash the admin account page + `/admin/audit` (`AuditKind`/`auditActionText` lacked `comp_granted`/`comp_revoked`; the string was cast blindly) | Added both kinds to the union + labels; `admin-audit-label` test now enumerates them (it would have caught the crash). |
| 2 | MED — `currentPeriodEnd` always null (Stripe SDK 23.x moved `current_period_end` onto the subscription item) | Read from `item.current_period_end` with a legacy top-level fallback. |
| 3 | MED — `invoice.paid`/`invoice.payment_failed` were no-ops (subscription id now at `invoice.parent.subscription_details.subscription`) so the grace window wasn't driven by invoice events | Resolve the invoice's subscription id from the new location (legacy fallback); `billing-webhook.int` invoice test added. |
| 4 | LOW — admin "Complimentary" count included lapsed (dated past-end) comps | Added an `endsAt` filter matching `compActive`; `admin-billing.int` test added. |

Notes (not fixed, with rationale): the singular `sub.discount` fallback in `readPromo` is dead in this API version but harmless; trial creation in `establishProfile` is best-effort (logged, not in the profile tx), acceptable and idempotent via the one-trial partial index.

Findings 2 and 3 were not caught by the integration suite because it injects a fake `getSubscription` and synthetic event shapes — they manifest only against **real Stripe**, which this run does not exercise (see §6). The fixes are correct and defensive (new-location-first with legacy fallback); their real-Stripe behavior is reported **unverified**.

## 6. Verification evidence

**Final suite on the integrated feature branch (HEAD `3467b9d`):**
- `typecheck` ✅ · `lint` ✅ · `format:check` ✅ · `verify:client-bundle` ✅ (no server/Stripe secret in `.next/static`)
- **unit `npm test`: 92 suites / 1355 tests pass** ✅
- **integration `npm run test:integration`: 63 suites / 689 tests pass** ✅ (embedded Postgres; migration `9j` applies cleanly)
- `next build`: **compiles successfully, 49/49 static pages**; the process then exits non-zero **only** on the pre-existing Next.js **security-advisory nudge** (documented in the Public Accounts report §7; reproduces independent of this diff). Not a feature defect; recorded for the owner as a separate upgrade.

**Adversarial verification (all via passing unit/integration tests):**
- Free keeps complete logging, planning, basic history, goals, support, export, deletion — `billing-gating.int`, `gate` unit, isolation suites.
- A Free account cannot receive a Pro result through a direct query-path call — `billing-gating.int` (planned list, session summary, exercise history all withhold; `locked` set).
- Trial grants Pro from signup and expires to Free by date — `entitlements` unit (time injected).
- Trial expiry/downgrade/cancellation/revocation/failed-payment never delete or alter training rows — `billing-webhook.int`, isolation logged-history suites.
- Trial + subscription + comp overlap resolves correctly; one source ending doesn't revoke another — `entitlements` unit.
- Founding-member comp preserves data and is not a payment — `founding-members.int`.
- Comp grant/revoke are owner-only, audited, independent of Stripe — `admin-billing.int`.
- Unsigned/invalid webhook rejected (400, nothing written); duplicate event is a no-op; out-of-order converges via re-fetch; subscription tied to the correct account; forged `client_reference_id` can't reassign a linked customer — `billing-webhook.int` + route handler.
- Browser checkout return never activates Pro (resolver ignores `?status`) — by construction + `billing-checkout` unit.
- First checkout requires a verified email; Free needs none — `billing-checkout` unit + the Public Accounts static guard (extended for the billing checkout module only).
- Payment-card data is never stored/logged — adapter is `server-only`, hosted pages only; client-bundle check green.
- Admin billing views expose no training content and never edit Stripe state — `admin-billing.int` + `admin-gate` unit.
- Account isolation, deny-all RLS, logged-history integrity, gym/progression invariants intact — full isolation suite + `schema.int` + `ownership-enforce.int` green; the three owned billing models carry isolation coverage; `WebhookEvent` proven un-owned with deny-all RLS.
- Web purchase/management works without native iOS deps — the whole feature is web routes/actions; build green.

**Honestly UNVERIFIED (require a human/environment the unattended run lacks):**
- **Live Stripe test-mode round trips** — real hosted Checkout, Customer Portal, and webhook delivery against real `sk_test_…` keys + a real endpoint (runbook §2–§4). The adapter + reconciler are exercised only with a mocked provider / synthetic events.
- **BLIZZY repeating-coupon month semantics against real Stripe** (3 monthly periods, 200-cap, first-time restriction) — must be verified in the Stripe test dashboard (runbook §4); the code does not invent a day count.
- **Review findings 2 & 3 real-Stripe behavior** — the Stripe-shape fixes are verified by shape in tests but not against a live event.
- **The production founding-member migration and the production schema migration** — human-run from the runbook with a backup.
- No native/iOS/TestFlight check was applicable or claimed (iOS postponed).

These are reported as **unverified, not passed**, per the verification-honesty rule.

## 7. Integration & merge status

The 7 ticket branches are a clean stack (each off its predecessor); the feature branch was fast-forwarded to the tip, so PR #112 carries all 7 tickets + the runbook. The per-ticket PRs #113–#119 remain open for traceability (their bases are each other). **PR #112 is held OPEN and unmerged for human approval** — never merged by the run, per the mandatory gate.

Note on the stacked chain: the admin-guard/admin-actions test sync and the move of the admin billing DTOs to `src/lib/admin/types.ts` (so the client section imports types outside the data layer) landed in B7's commit rather than B5's; the integrated feature branch is fully consistent and green.

## 8. Outstanding owner decisions (before live billing)

Production prices and the authoritative Stripe products; whether to enable Stripe Tax (and the registration behind it); confirmation of the 7-day grace default; the BLIZZY live-campaign terms. All are configurable test-mode values today; none is resolved by the run. Live mode, real charges, the production migration, the founding-member migration, and enabling public signup are human-gated (runbook §13).

## 9. Near-misses / notes

- The review caught a **real admin-UI crash** (comp audit entries) that the data-layer tests missed — now fixed and covered by the exhaustive label test.
- The two Stripe field-relocation bugs (period end, invoice subscription id) are the kind only a real Stripe round trip exercises; the mocked-adapter suite is deliberately green around them, so they are called out as unverified against live Stripe even after the fix.
- Adding a default Pro comp to the test factory had a small blast radius (3 integration suites counting a fresh account's rows / partitioning tables); all three were reconciled (plan.int opts out; schema.int/UNOWNED_TABLES and export.int fixtures updated).

## 10. Stop conditions

**None triggered.** No invariant weakened (account isolation, logged-history, deny-all RLS, admin boundary, no Pro-to-Free, no stored tag/e1RM, baseline/transaction rules, no secret in client bundle all preserved); no approved doc contradicted; no production data/credentials/live Stripe touched; no destructive/irreversible op. The iOS sequencing override was applied as authorized (web-only; `overload-cross-platform` not invoked).

**Final: PR #112 is OPEN and unmerged, awaiting human review and approval.**

---

## 11. Required Upstream Amendments — iOS Postponement

Recorded here only; the owner applies the permanent edits (the run did not modify `docs/planning/`).

1. **Pitch Roadmap (`docs/planning/pitch-roadmap.md`):**
   - Numbering/sequence: this feature is roadmap **Pitch 20** but shipped as working number **19**, immediately after Public Accounts (itself resequenced to 18), because **iOS Foundation (Pitch 18) is postponed**. Renumber, or add a note that iOS Foundation moves to a later phase and the commercial pitches shift down by one.
   - **Pitch 20 "Depends on"** lists **iOS Foundation (18)**. Amend: the iOS dependency is **removed for the web release** — billing shipped web-first with hosted Checkout/Portal and browser return flows; native purchase paths (App Store external-link rules, Play Billing) are decided in the later store-release pitches.
   - **Dependency Map** lines ("Pitch 18 … blocks … 20", "Pitch 20 depends on 17, 18, 19") updated to reflect that 20 shipped without 18.
   - **Rollout gates** unchanged: no payment collected until Launch Readiness & Closed Beta; this pitch builds+tests the system in Stripe test mode only.

2. **PRD (`docs/planning/prd.md`):** the Plans, Billing & Promo Codes entry and the Feature-Dependencies paragraph — note it shipped **web-first, before** the iPhone shell; the platform-neutral entitlement model is in place so a future native client consumes the same resolved access. Acceptance criteria stand.

3. **Architecture Doc (`docs/planning/architecture.md`):** the entitlement/capability model, `Entitlement`/`BillingAccount`/`PromoRedemption`/`WebhookEvent` objects, capability enforcement, trial/subscription/comp sources, and idempotent webhook handling match what shipped. Add a note that **native billing / Capacitor is deferred** and that checkout/portal returns are browser-based for now. Fold the four new objects + the two `AdminAuditAction` values into the data-model enumeration if it lists columns.

4. **CLAUDE.md (both root and `.claude/`):** the commercial/billing rules already describe capability enforcement, the three entitlement sources, comp-in-admin, Stripe-only money, and no-card-data — all honored. Add the new data objects (`Entitlement`, `BillingAccount`, `PromoRedemption`, un-owned `WebhookEvent`) and the `plan_required` (402) error code to the consistency lists; note the `emailVerifiedAt` first-checkout gate is now a sanctioned reader (billing checkout module) in the verification-gates rule. Note iOS remains postponed (the cross-platform platform-impact rule did not apply this run).

5. **Method note (`docs/planning/method-note.md`):** optionally record the capability names + `PLAN_CAPABILITIES` mapping, `TRIAL_DURATION_DAYS=14`, `GRACE_PERIOD_DAYS=7`, the entitlement-resolution rule, and the webhook idempotency/reconcile contract, since the Landing Page and Plan Import pitches consume them.

6. **Pipeline guide (`overload-pipeline-prompt-guide.md`, external — not found in the repo):** Appendix D2's iOS-before-billing ordering is superseded for the web release; record the iOS postponement and that billing shipped web-only in Stripe test mode.

None of these is a contradiction requiring a halt — they are the expected bookkeeping of the owner-authorized resequencing, to be applied by the owner.
