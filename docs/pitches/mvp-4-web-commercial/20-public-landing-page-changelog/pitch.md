# Overload — Pitch 21: Public Landing Page & Changelog

> **Repository stem:** `20-public-landing-page-changelog`. Roadmap pitch **21**. The repository numbers pitches one lower than the roadmap since the owner postponed iOS Foundation (roadmap 18): Public Accounts is `18-…` (roadmap 19) and Plans, Billing & Promo Codes is `19-…` (roadmap 20). No pitch, design doc, spec, preview, or Linear milestone existed for this pitch before this run (checked `pitches/`, `docs/`, and Linear project Overload V1 on 2026-11-04). This file was created from the owner's one-shot run prompt ("Input Pitch — approved feature boundary"), which is the approved feature scope. It is **not** legal publication approval.
>
> **Companion inputs (owner-supplied, verbatim):**
> - Appendix A — `docs/pitches/mvp-4-web-commercial/20-public-landing-page-changelog/appendix-a-demo-seed.md` (synthetic demo seed and interactive-tour requirements)
> - Appendix B — `docs/pitches/mvp-4-web-commercial/20-public-landing-page-changelog/appendix-b-privacy-draft.md` (full Privacy Policy working draft, owner fact-check required)
> - Appendix C — `docs/pitches/mvp-4-web-commercial/20-public-landing-page-changelog/appendix-c-terms-draft.md` (full Terms of Service working draft, owner fact-check required)
>
> The run prompt's pre-resolved decisions 1–12 are approved authority for this pitch. They are recorded as Resolved Decisions in `docs/pitches/mvp-4-web-commercial/20-public-landing-page-changelog/spec.md`.

**Type:** Feature · **Appetite:** M (upper bound; primarily interface work) · **Status:** Revised for execution; complete legal drafts supplied for owner verification, deterministic demo-seed implementation specified, marketing voice locked · **Platform:** Web-first, responsive in mobile browsers; native iOS/Android deferred

**Sources of authority:** `docs/planning/product-brief.md`, `prd.md` → *Public Landing Page & Changelog*, `architecture.md`, `pitch-roadmap.md` → *Pitch 21*, `CLAUDE.md`, and the established What's New, Public Accounts, and Plans & Billing implementation/specs. The current repository is the authority for routes and code conventions, not this pitch's assumptions about filenames.

## Problem

Overload's training product exists, but a person arriving from a Road to 315 / creator video needs a credible public entry point. They should understand what Overload actually does, who it is for, why a lifter would use it instead of notes, what is free, what Pro adds, and whether they can join **right now**. Today, signup is restricted and live payments are disabled; a public page must not turn those operational facts into misleading buttons or promises. The creator also needs a truthful, maintainable place to explain the BLIZZY promotion and show visible product progress without writing release notes twice.

This pitch serves the Product Brief's core job: help lifters decide when to progress, hold, or deload based on their own logged training, while leaving capture, history, and export Free. It markets *decision support from logged performance*, not a generic AI coach, a generated workout program, or a social fitness network.

## Appetite and shape

**M, at the upper edge.** The slice is a connected set of relatively simple public-facing pages plus release-note reuse, responsive presentation, and a narrow campaign handoff. The design and implementation must resist becoming a CMS, analytics platform, marketing funnel, or new checkout/signup service. If the implementation exceeds M, reduce polish/optional extras before sacrificing privacy, CTA truthfulness, or the public changelog's shared source.

## Solution shape — included

1. **Public landing page.** A signed-out entry point in the existing Next.js application. It explains the product with concrete demonstrations of training logging, progression/hold/deload guidance, and gym-aware weights, followed by truthful Free/Pro positioning. It works at mobile and desktop widths and provides a path to the plan comparison, changelog, support, and the currently available join/login action. Use Overload's existing brand and design system; the UI design stage decides the actual hierarchy and styling.
2. **Public pricing page.** Clear Free versus Pro comparison. Owner-approved intended prices are **$4.99/month** and **$39.99/year**. Free always includes workout capture, complete history, and export, with no ads. Pro includes implemented interpretation and insight capabilities; do not advertise Plan Import as already available before the later import feature ships. The approved **14-day card-free Pro trial** is described accurately, but cannot be started through a disabled signup flow.
3. **Creator page at `/blizzy`.** Explain the owner-approved BLIZZY offer: 50% off the first three monthly billing cycles, subject to first-time-customer eligibility and a 200-redemption cap. The code is carried as first-party campaign intent through the relevant journey and is usable at checkout **only when checkout is actually enabled**, within the already-secured billing/promo flow. The visitor must not be misled into believing a discount or payment is available while live billing is off. No fabricated remaining-redemption counters or fake scarcity.
4. **Public changelog.** Read the same repository-maintained release-note entries already used by authenticated What's New, with no copy/paste second source. Preserve established ordering, dates, and unread-seen semantics for signed-in users. Review content eligibility before exposing a note publicly; never leak internal or security-sensitive release details.
5. **Support and legal access.** Reuse the existing support/contact channel. **Complete owner-review drafts** accompany this pitch (Appendices B and C); they are the starting copy, not placeholder-free or attorney-approved documents. The implementation may prepare `/privacy` and `/terms` route components and content-integration tests, but **must not publish either as approved terms until the owner confirms operator identity, age/jurisdiction/refund details, actual data practices, and required legal review**. Keep pages at stable public destinations once approved. The owner should edit/review drafts rather than write both from scratch.
6. **Minimal first-party campaign attribution.** Preserve a narrow, validated origin such as the `/blizzy` landing and promo intent across a normal same-browser signup/checkout navigation, without third-party tracking or cross-site identifiers. At signup, record only the provenance needed to answer which campaign led to an account, using the repo's account ownership and privacy rules. Where persistent tracking/retention or a schema change is needed, document the exact privacy consequence and owner approval/deployment step; do not silently introduce a third-party service or long-lived behavioral profiling.
7. **Live-state-aware CTAs.** The public pages reflect the actual server-controlled signup mode (`closed`, `invite`, `public`) and the billing kill switch (`STRIPE_BILLING_ENABLED`, currently false in Production). Closed means no pretend signup/waitlist; invite-only means a clear invitation requirement; public means signup when explicitly authorized; disabled billing means no live Subscribe action. An already-signed-in visitor can reach the training app without a marketing/login loop.
8. **Deterministic synthetic demo dataset and capture handoff.** Add a reusable seed fixture + guarded operator CLI to populate an **existing, expressly selected demo account only in an isolated environment**; use authentic, synthetic workout history for screenshots and a later Navattic/Supademo-style click-through tour. The pipeline must never create/modify a production auth account, hard-delete an existing test account, or seed against production/shared Supabase (`ycxvdiklpefyhdclxyau`). No live public demo login is offered. Provide a 4–6 step walkthrough storyboard, clean screenshots where safe, and an owner-facing publish/third-party-demo review step. Full requirements in Appendix A.
9. **Discoverability and guidance.** Appropriate semantic metadata, indexable public pages, responsive layout, accessible controls, and the existing `/overload-onboarding` guidance/release-note convention for the visible changes. No new user-tour mechanism.

## Out of bounds

- **No native iOS work:** no Capacitor setup, Apple Developer account, TestFlight, Universal Links, App Store listing, native UI, mobile purchasing, or device-build gate. Mobile Safari/Chrome rendering of the **website** is in scope.
- No opening public signup, enabling live Stripe, collecting a real charge, changing prices, trial duration, grace rules, coupon eligibility, or entitlement enforcement.
- No new billing processor, extra authentication route, replacement customer portal, or redesigned checkout. BLIZZY must use the existing secured billing path.
- No blog, testimonials, review quotes, fake engagement statistics, A/B tests, referral program, email-capture/waitlist product, newsletter, marketing automation, ad pixels, third-party trackers, or analytics SaaS.
- No use of actual lifters' private plans, workouts, gyms, sets, names, or history in promotional screenshots. No AI-generated image represented as a real app screenshot. No freely accessible authenticated demo account or third-party demo embed/tracking without separate review.
- Do not treat a production demo-account seed as part of Pitch 21 automatic execution. Any later production fixture operation is a separate, explicit owner-authorized operator action with target verification and recovery/rollback planning.
- No AI coaching, generated plans, social features, nutrition, or unshipped Plan Import marketed as shipped.
- No publishing AI-authored drafts as approved legal terms by default. The provided complete draft copies reduce the owner's writing burden but still require factual reconciliation and an owner publication decision.
- No generic AI-marketing clichés, invented transformation stories, fake social proof, manipulative urgency, exaggerated product or safety claims, or "AI-powered fitness coach" framing.

## Dependencies and current operational truth

- **Already delivered:** Public Accounts, recovery/support, verified production email callbacks, Free/Pro entitlements and billing kill switch, shared What's New release notes, founding-member comp cutover.
- **Production state:** `STRIPE_BILLING_ENABLED=false`, signup `closed` or `invite` (must read actual setting); no live Stripe payment flow. Do not modify those settings.
- **Database constraint:** This project's confirmed Supabase ref `ycxvdiklpefyhdclxyau` has been used for Production as well as local/Preview during recent work. Treat it as **production**. Do not run schema writes, seeds, data mutations, screenshot seeding, or test suites against it. Use isolated fixtures/embedded Postgres. If a migration is needed, author and test it in isolation, leave deployment to a human, and stop before production merge.
- **Companion owner-review materials:** complete Privacy Policy draft, Terms draft, and deterministic demo-seed/tour implementation plan are included with this pitch. They don't authorize legal publication or a production seed.
- **Owner-authorized platform adjustment:** iOS Foundation remains postponed. The roadmap dependency map still treats it as upstream of several commercial pitches; for this web-only slice, do not treat it as a required build. Record the roadmap mismatch as a required upstream amendment, not a silent doc rewrite. Pitch 23's native-device checklist will need an explicit owner launch-gate decision later; do not silently mark it satisfied.

## Definition of done (traced to roadmap and PRD)

**P21-AC1 — CTA truth** *(PRD: Public Landing Page & Changelog AC1; roadmap DoD).* Visitors see an action that matches the active signup/billing mode. No public payment option while billing is off; no misleading early-access signup if signup is closed. Every path handles signed-out, signed-in, invite-only, public, and billing-disabled states correctly.

**P21-AC2 — Shared release-note source** *(PRD: Public Landing Page & Changelog AC2; roadmap DoD).* Public changelog and authenticated What's New derive from the same entries; publishing one entry updates both appropriately without duplicating authored content, while What's New read/unread behavior remains correct.

**P21-AC3 — Demo seed + genuine imagery** *(PRD edge case; roadmap Includes).* A tested, deterministic fixture and default-read-only, production-refusing seed tool can populate a verified isolated demo account without corrupting training history or existing users. Actual screenshots are captured from that seeded app, checked for synthetic-only content. Provide a click-through tour storyboard compatible with a capture tool; external demo publication is separate and optional. If safe capture cannot be completed, mark screenshots blocked rather than using production data.

**P21-AC4 — Public pages and promo handoff** *(roadmap Includes and DoD).* Landing, pricing, `/blizzy`, changelog, and support/contact are publicly reachable as appropriate. Privacy and Terms routes are built and tested but published as final legal content only after explicit owner approval. The BLIZZY origin/code is preserved to the existing eligible monthly checkout path without bypassing normal eligibility or billing-disabled controls.

**P21-AC5 — Owner-review legal drafts and controlled publication** *(roadmap DoD; owner dependency).* Complete Privacy Policy and Terms drafts are supplied with this pitch. The pipeline imports them as reviewable content, tests route integration, and compiles a fact-check/sign-off checklist. **Publication is incomplete until the owner confirms actual practices, fills the remaining legal facts, and approves what is displayed.** Do not silently publish unresolved bracketed disclosures. If owner sign-off is absent, hold the legal publication gate and report it; don't invent approval.

**P21-AC6 — Fast, accessible mobile web** *(roadmap DoD).* Public pages work with keyboard/screen reader semantics, reasonable image loading, semantic metadata, mobile viewport behavior, and no regression to signed-in account journeys. Actual native iOS device tests are not a requirement of this web-only pitch.

**P21-AC7 — First-party attribution** *(roadmap Includes; additional behavioral verification).* Approved landing source/promo code is retained across allowed same-browser flow and attached safely to signup provenance without leaking, persisting unnecessary visitor identity, or changing billing eligibility. Test no-campaign, tampered, expired, repeat-visit, and cross-account cases.

**P21-AC8 — Distinctive, evidence-led copy.** Marketing language must come from the actual app and product brief, make one concrete claim per section, and connect each important feature claim to a real seeded screenshot or visible user flow. Avoid stock SaaS copy and anything that sounds like generated marketing filler; provide a concise claim-to-evidence checklist for owner review. No fabricated metrics/testimonials.

## Marketing voice and creative direction — intentionally not generic

Overload is an **instrument for self-programming lifters**, not a motivational brand, AI personal trainer, or lifestyle community. The writing should feel like a lifter explaining to another lifter why a notes app stopped being enough. Use unvarnished language, specific weights/reps/gyms only when backed by genuine synthetic app captures, and short captions tied to real decisions. The visual direction should have intentional typography, restrained use of the existing Overload blue, strong hierarchy, generous whitespace and a real training-workflow story; use existing components, no novelty effects for their own sake.

**Possible positioning concepts to test, not approved final copy:** "You logged the reps. Know what to do next."; "A workout log should tell you more than what happened last time."; "One exercise, two gyms. Two working weights."; "Logging is free. The call on your next set is Pro." These lines must be edited against actual interface capabilities and the owner's voice before publishing. Don't stack all of them together into a wall of slogans.

**Reject phrases unless specifically justified:** "Unlock your potential," "revolutionize your fitness journey," "train smarter, not harder," "game-changing insights," "powerful analytics at your fingertips," "crush your goals," "AI-powered coaching," "the ultimate fitness companion," "seamless experience," or over-excited exclamation-heavy copy. No fake member counts, rating stars, personal testimonials, elite-lifter endorsements, or unverified recovery/injury-prevention claims. Support the BLIZZY offer with precise conditions and a real availability state, not hype/scarcity theater.

**Creative deliverables:** 2–3 distinct hero concepts with honest example copy and actual screenshot placement in the UI preview; choose one on product truth, clarity, and memorable specificity. Write section-by-section *claim → evidence → CTA*, with a marketing-claims ledger that identifies feature implementation and image evidence. Owner retains final copy sign-off. The design can be original and sharp without becoming flashy or vague.

## Rabbit holes and explicit no-gos

- **Root routing and auth proxy:** A public homepage must not cause authenticated users to lose their app entry point, redirect loops, or loosen auth on training routes. Establish exact behavior in the design doc/spec.
- **Marketing honesty:** Live checkout is currently disabled, and Preview may have active sandbox checkout. Never infer production availability from Preview, and never link paid CTA to sandbox Stripe.
- **Promo semantics:** The product has both monthly and annual prices. The code is monthly-only and subject to Stripe's real eligibility/cap; `/blizzy` is not the authority for discounts. Avoid promise of guaranteed future availability or fake remaining spots.
- **Privacy, data ownership, and legal:** Don't publicize private training history, count anonymous visitors with persistent identifiers by default, store raw marketing query strings, or invent a Privacy Policy. Public data exposure and legal sign-off are real owner boundaries.
- **Shared release data:** Changes to public rendering may expose internal-only release-note details. Design a public-safe rendering without a second manually maintained changelog.
- **iOS dependency drift:** The roadmap still implies the iOS Foundation preceded this work; honor its owner-authorized deferral and flag the necessary roadmap/Launch Readiness update instead of starting native work.

## Remaining owner tasks / acceptance gates

1. **Review the supplied full legal drafts**, rather than authoring both policies from scratch: verify factual vendor/data/retention claims, enter legal operator name/contact address, choose minimum age, refund and jurisdiction positions, confirm region-specific obligations, and explicitly approve what is published. Qualified legal review is recommended before public launch.
2. **Review the proposed synthetic dataset and captured imagery.** The deterministic seed and isolated screenshots are an engineering deliverable; no production seed or account deletion occurs in this pipeline. If a future production demo account is desired, authorize it separately with explicit target, backup/rollback decision, and safety safeguards.
3. **Choose whether to host a click-through demo** using Navattic, Supademo, or another provider. A shareable recorded demo is optional; any third-party embed/analytics requires vendor/privacy review. No live public demo credentials.
4. Review the **distinctive, low-hype marketing voice**, final marketing claims, actual screenshots, public prices, BLIZZY wording, and first-party attribution/retention description.
5. Review resulting PR and runbook before deploying; never enable live payments or public signup here.
6. At Pitch 23, decide the web-first launch criteria in light of iOS postponement and complete independent production security/backup and payment gates.

## Stage boundary

This pitch bounds the user experience and risk. The **design doc** determines visual hierarchy, responsive behavior, and states; the **UI preview** is the visual contract; the **spec** chooses reuse of release-note machinery, attribution representation, routing details, and integration with existing guarded signup/checkout. Do not treat this pitch as permission to introduce a new stack or to operate Production.
