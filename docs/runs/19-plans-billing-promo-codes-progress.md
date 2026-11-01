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
- [ ] 6. Linear tickets (milestone + blockedBy chain + User Guidance)
- [ ] 7. Feature PR opened → main
- [ ] 8. Implementation — `/overload-ticket-worker` per ticket
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
