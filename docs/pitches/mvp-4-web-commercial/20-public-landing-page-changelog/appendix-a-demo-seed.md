# Pitch 21 — Appendix A: Synthetic Demo Account, Deterministic Seed, and Interactive Tour Plan

> Owner-supplied companion input for `docs/pitches/mvp-4-web-commercial/20-public-landing-page-changelog/pitch.md`, reproduced verbatim from the one-shot run prompt (2026-11-04). **Status:** approved as an engineering task for an **isolated database only**. A production-account fixture or third-party interactive-demo publication requires separate owner approval.

**Status:** implementation specification for Claude Code, not an executed seed. No existing Prisma schema or authentication code is available in these planning attachments; Claude must inspect the actual repository before choosing model names, commands, and transaction boundaries.

## Goal

Give Overload one credible, repeatable **synthetic training history** that can power actual app screenshots and later a recorded click-through demo. The public demo is a **recorded/captured experience**, not a publicly accessible live authenticated user account.

## Delivery in Pitch 21

1. **Deterministic fixture definition.** A versioned file of synthetic account training data in the repository (TypeScript/JSON as appropriate to existing conventions), with explicit fixture version, fixed identities for fixture-owned rows, and an `anchorDate` input. Do not hardcode a real user's identifiers. Use realistic training data consistent with progression rules.
2. **Reusable seed/operator tool.** An idempotent CLI that can populate an **already existing, explicitly selected demo account** in a verified isolated test environment. The preferred CLI targets a Supabase Auth account created through the normal signup/invite/verification flow, then populates only that account's allowed training models using existing write/service boundaries. **In a genuinely isolated test-only environment**, an optional companion setup command may provision the test Auth account through the supported Auth API/test harness and clean up only its own fixture; never create Auth users by raw SQL or bypass email verification, entitlement, or logging invariants in Production.
3. **Zero-write dry-run default.** Show target project, safe account identifier/email mask, fixture version, expected created/updated row counts, and any conflicts without reading any other user's training data. No mutation without an explicit `--execute` and exact target confirmation. No bulk-delete/reset path. Abort if the target contains non-fixture data. Do not reset real accounts.
4. **Strict environment guard.** Before any write, independently verify both the effective project ref derived from database credentials and the selected user identity. The currently known `ycxvdiklpefyhdclxyau` project **IS PRODUCTION** even if local `.env` or Preview labels call it dev. Default refusal of writes to this ref or any production hostname; test suite uses embedded/isolated Postgres. A future exceptional production run requires a **separate owner-approved operator procedure** with fresh dry run, backup/recovery decision, exact target account, explicit production flag and project-ref confirmation, and a documented rollback of fixture-owned rows only. Pitch 21 pipeline never performs that exception.
5. **Safe re-runs.** Do not overwrite, detach, or delete real logged sets. A second run against the same fixture version produces no new rows; changing fixture version requires a migration plan. If there is a fixture-owned-row repair, preserve logged-set correctness and attribution, and use the existing logged-sets service layer—not ad-hoc Prisma writes prohibited by CLAUDE.md.
6. **Actual UI screenshots.** Capture desktop and phone-width views from the local/isolated instance after seeded data is validated. Sanitize output: no real emails, session tokens, debug panels, user identifiers, environment-specific URLs, API keys, or real gyms/people. Verify the screenshots are real app renders, not invented/AI-generated representations.
7. **Click-through demo ready.** Record a clear 4–6 step journey from this synthetic dataset and deliver a storyboard/capture checklist and clean assets usable in Navattic or Supademo. Do not install a third-party tracker, embed a demo script, or publish hosted captures during this pitch without separate owner review of privacy, tracking, vendor terms, and costs. If a third-party hosted demo is adopted later, add transparent disclosure and ensure it is anonymous and read-only.

## The synthetic story

A plausible self-programming lifter, **Demo Lifter**, follows an upper/lower strength-hypertrophy split across two fictional gyms. They have **approximately 8–10 weeks of history** (not exaggerated lifetime claims), several sessions per week where supported by the schema, a repeating set of lifts, and realistic variation. The demonstration should highlight *why the guidance differs* rather than a chart full of convenient perfect numbers.

**Important sequence** (construct from actual rules after inspecting code):

- **Capture:** one session shows planned exercise, sets, target reps, a handful of completed logged sets, and preserved history.
- **Progress:** bench press (free weight) shows repeatable rep improvement before a modest progression recommendation supported by data.
- **Hold:** an accessory lift has mixed performance in recent sessions and a legitimate hold recommendation.
- **Deload:** a distinct lift or a designated mesocycle deload week demonstrates a supported deload decision—not a fabricated badge placed on a screen.
- **Different gyms:** the same machine-style exercise at fictional **Northside Strength** versus **Riverside Fitness** has distinct working-weight baselines; never imply that plate/barbell weights are gym-dependent.
- **Trend:** progression/e1RM chart shows a non-linear but believable pattern rather than a straight-line artificial growth curve; optional goal progress if it genuinely exists.
- **Free/Pro states:** sample screenshot sets may demonstrate both entitlement surfaces by using **isolated fixtures or read-only UI preview states**; do not mutate a real account's billing state or spoof a Stripe subscription in production.

Build only supported objects (gym, exercise, mesocycle, session, session exercise, logged exercise/set, cardio/goal if applicable). No new production schema solely for seed tracking. If fixture provenance cannot be done safely under existing schema, use a documented isolated fixture database reset workflow only; do not infer row ownership by names when deleting.

## Implementation/acceptance checks

- Dry-run is default; no mutation in the production project under any normal CLI invocation.
- Seed requires explicit account ID (optional email is a cross-check only) and verifies its Auth/Profile match; account is not created by data seed.
- Cross-account isolation remains green; run against isolated database only.
- Deterministic row counts and view screenshots from a fixed version and anchor date.
- Fixture handles time zones and multi-gym baseline invariants; creates no detached history or impossible performance outcomes.
- Re-run does not duplicate workouts, exercises, or sets and never edits non-fixture rows.
- All generated captures use only synthetic data and have an owner-facing privacy/quality checklist.
- Automated tests demonstrate no-write dry-run, production hard refusal, wrong-account abort, duplicate-run idempotency, and preservation of logging rules.

## Click-through tool choice

The name you were recalling is likely **[Navattic](https://www.navattic.com/product/interactive-demos)**. It supports captured interactive web-product screens, share links, and embeds. **[Supademo](https://supademo.com/features/guided-demos)** is an alternative for guided screenshot, HTML, or sandbox-style tours. Both are external services; using either for a public embed, or turning on its tracking, needs an explicit owner decision and updated vendor/privacy notice first.

**Recommended sequence:** seed local isolated app → capture clean desktop/mobile screens → make a short storyboard → review marketing and data privacy → record in chosen demo tool → optionally publish a link, then embed only after review. A future production demo account can help capture if the owner explicitly authorizes its creation and seeding, but public visitors should access the recorded demo **without a live Overload login**.

## Owner choices remaining

- Decide whether to purchase/use an external interactive-demo tool, and whether to show a hosted link or on-site embed.
- Choose final screenshot and demo narration text based on true UI behavior.
- If the owner later wants a production demo account, separately approve the exact account identity, project target, seeded rows, restoration/rollback plan, and execution; do not delete a live test account through SQL just to reuse an email as part of this pipeline.
