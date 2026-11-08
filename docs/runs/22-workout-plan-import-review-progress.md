# Pitch 22 — Workout Plan Import & Review — Run Progress

**Run started:** 2026-11-07
**Policy:** Autonomous Pipeline Policy (`CLAUDE.md`). Decide, don't ask. Halt only on the four stop conditions.
**Merge behavior:** STOP BEFORE MERGE into `main`. Feature PR left open for owner approval.

## Canonical slug

`22-workout-plan-import-review` — matches the **pitch number** (22), as dictated by the run prompt.

**Divergence note (recorded decision):** The repository's prior pipeline artifacts use a slug
number that lags the pitch number by one (Pitch 20 → slug `19-plans-billing-promo-codes`,
Pitch 21 → slug `20-public-landing-page-changelog`). No authoritative existing stem for Pitch 22
exists in the repo. The run prompt explicitly mandates `22-workout-plan-import-review`, so this run
uses the pitch-number slug. All Pitch 22 artifacts (pitch, blueprint, design, preview, spec, runbook,
report, progress) use this single stem consistently. Authority: run prompt (explicit). Flagged as a
convention note in the run report.

## Source documents (Step 1 — authority)

| Document | Linear ID | Retrieval | Local copy |
| -- | -- | -- | -- |
| Product pitch: *Overload — Pitch 22: Workout Plan Import & Review* | `5b618c0e-c9d4-4a84-9d49-8ec52c471962` (slugId `31c72704a9a8`) | ✅ Full (11 sections + P22-01..10 matrix) | `pitches/22-workout-plan-import-review.md` |
| Technical blueprint: *Overload — Pitch 22: Document Intake & Extraction Technical Blueprint* | `1a2755f6-1453-4bf0-8647-52a04e14709c` (slugId `20a7d1e5a683`) | ✅ Full (12 sections incl. state §4, security §8, testing §7) | `docs/technical/22-workout-plan-import-extraction-blueprint.md` |

Both documents retrieved in full and verified to contain all numbered sections. Authority established.

## Codebase inventory (Step 1 — blueprint §2 audit, key findings)

Code root is `src/lib/` (CLAUDE.md examples say `lib/`). Stack: Next 16.4.5, React 19.3.0,
Prisma 7.10.0, Jest + embedded-postgres integration, Playwright E2E.

- **Plan creation (authoritative, reuse on confirm):** `src/lib/plan/mesocycles.ts`
  (`createMesocycle/activateMesocycle/cloneMesocycle`), `src/lib/plan/sessions.ts`
  (`addSession`, `addSessionExercise`), `src/lib/plan/cardio.ts` (`addPlannedCardio`),
  `src/lib/exercises/exercises.ts` (`createCustomExercise`). All accept optional `tx?: Db` and
  compose in one transaction. Existing seeding path `scripts/import/real-plan/import.ts`
  (`applyImport(account, input, tx)`) already composes them inside ONE transaction, reusing exact
  gyms/customs — this is the model for the confirm adapter. Mesocycles start `status:"draft"`;
  `activateMesocycle` is separate. **Confirm will create a DRAFT mesocycle** (lifter activates later
  in the normal Split & Mesocycle UI).
- **🔴 Prescription model limitation:** `SessionExercise = { exerciseId, plannedSets, targetRepMin,
  targetRepMax, position }`. **No planned load/rest/tempo/notes/superset/percentage/RPE fields.**
  Extracted load/rest/tempo/superset/%/RPE/RIR have NO home in the plan model → surfaced in review
  as read-only source context + `OUT_OF_SCOPE`/unsupported markers, NOT persisted. Maps: source sets
  → `plannedSets`; source rep/range → `targetRepMin/targetRepMax`; day label → `Session.name`;
  day order → `Session.dayOfWeek`/`position`; title → `Mesocycle.name`. (Blueprint §3.5.5 honored.)
- **Pro gate:** `requireCapability(account, "plan_import")` (`src/lib/entitlements/require.ts`) →
  `DomainError("plan_required")` 402. Resolver `resolveEntitlement` (`src/lib/entitlements/resolve.ts`).
- **Account-scoped data layer:** `src/lib/data/account.ts` (`requireAccount()` → `Account{userId,
  timeZone, db}`), `account-db.ts` (`createAccountClient`), `scope.ts` (`scopeArgs`, PURE; **refuses
  unknown models** → new owned models MUST be registered in scope.ts). `src/lib/db.ts` single client.
- **🔴 No scheduler/cron/queue** (architecture non-goal). Trial expiry/cleanup are date-math on read.
  → 24h scheduled-purge guarantee is MISSING infra. Plan: lazy per-request sweep + account-deletion
  integration + operator sweep script; flag scheduled guarantee as **owner-gated / P22-04 retention
  partial-blocked** (blueprint §4.4). Do NOT silently add cron (would contradict architecture).
- **Private Storage template:** `src/lib/feedback/screenshots.ts` — bucket `feedback-screenshots`,
  service-role only, deny-all RLS, owner-prefixed keys `<userId>/<group>/<n>.<ext>`, signed read
  URLs (5-min TTL), rows in `FeedbackAttachment`. Direct template for import-source storage.
- **Quota/budget template:** `src/lib/accounts/throttle.ts` — DB-backed atomic fixed-window upsert
  (`AuthThrottle`), fails closed. Template for 5-imports/day quota + global spend reservation.
- **AI SDK ABSENT** — must add `@anthropic-ai/sdk` (pre-decided in architecture; pin current version).
- **Account deletion:** `src/lib/accounts/deletion.ts` `ACCOUNT_DELETION_ORDER` — new owned tables
  MUST be inserted in dependency order; `src/lib/accounts/export.ts` must include them.
- **Admin:** `requireAdmin()` (`src/lib/data/admin/identity.ts`), allowlist env
  `OVERLOAD_ADMIN_USER_IDS`; admin never reads training content → import sources/drafts excluded.
- **Migrations:** `prisma/migrations/<n>_<feature>/migration.sql`, latest `9k_signup_campaign`;
  every new table enables RLS in its migration.sql. Feature flag pattern: `isCheckoutEnabled()` reads
  `process.env.STRIPE_BILLING_ENABLED==="true"` → mirror for `PLAN_IMPORT_ENABLED` (default OFF).

Full inventory retained in run context; condensed digest above drives design/spec.

## Pipeline step status

| # | Step | Status |
| -- | -- | -- |
| 1 | Pull source docs + establish authority + codebase audit | ✅ complete |
| 2 | Design doc | ✅ `docs/design/22-workout-plan-import-review-design-doc.md` |
| 3 | UI design gate (preview) | ✅ `docs/previews/22-workout-plan-import-review-preview.tsx` (1070 lines, bundles clean) |
| 4 | Specification | ✅ `docs/specs/22-workout-plan-import-review-spec.md` |
| 5 | Resolved Decisions | ✅ recorded in spec §Resolved Decisions (RD-0..RD-14) |
| 6 | Linear tickets + milestone | ✅ milestone + OVE-105..110 (chained) |
| 7 | Feature PR | ✅ [#130](https://github.com/troyrhodes02/overload-training/pull/130) (DO NOT MERGE) |
| 8 | Implement all tickets | 🔄 OVE-105,106,107,108 done; OVE-109 in progress |
| 9 | Operator runbook | ✅ `docs/runs/22-workout-plan-import-review-runbook.md` |
| 10 | Integrate ticket PRs into feature branch | 🔄 OVE-105 (#131), OVE-106 (#132) squash-merged |
| 11 | Full verification | ⬜ pending |
| 12 | Review (/review) | ⬜ pending |
| 13 | Audit & fix (/overload-review-audit) | ⬜ pending |
| 14 | Stop before merge | ⬜ pending |
| 15 | Run report | ⬜ pending |

## Resolved decisions (accumulating)

- **RD-0 (slug):** Use `22-workout-plan-import-review` (pitch-number slug) despite repo's prior
  slug-lags-pitch-by-one convention. Authority: run prompt (explicit).
- **RD-cap (Pro gate):** Gate on the already-reserved **`plan_import`** capability (defined
  `PLAN_CAPABILITIES.pro` in Pitch 19 billing spec, RD-1/RD-9). Enforce via
  `requireCapability(account, "plan_import")` → `DomainError("plan_required")` (402), resolver
  `resolveEntitlement(account)`. No new capability, no entitlement change. Authority:
  `docs/specs/19-plans-billing-promo-codes-spec.md` §RD-1/§636-659; architecture capability model.

## Planning context captured (Step 1)

- PRD §Journey "Importing an existing plan" (L89) + §Workout Plan Import & Review (L312): paste →
  proposed structured plan → match to library → flag ambiguous → offer custom → review/edit →
  confirm (nothing saved until confirm); instructions treated as data; never invents; usage
  limits + kill switch.
- Roadmap Pitch 22 (L246): "reusing the existing plan-seed format as the structured intermediate
  (to be confirmed in the spec)"; **Defers: Files, PDFs, photos, screenshots** → this run's
  owner-approved expansion overrides this. Depends on Pitches 19 & 20.
- Architecture L61: "Plan import state — a draft held only until confirm/discard, retention limit
  decided in the plan-import pitch, plus per-account usage counts." L163: provider/data-terms,
  retention, usage limits, spend cap, plan-seed reuse are this pitch's decisions.
- **Upstream amendment required (report, not edited now):** roadmap/PRD text-only deferral is
  superseded by owner-approved file/image scope expansion.

## Linear ticket IDs

**Milestone:** Workout Plan Import & Review (`9532ea7f-08fb-49b2-be80-37f3cc14be93`) in project Overload V1.

| Ticket | Title | blockedBy | Branch name (Linear) |
| -- | -- | -- | -- |
| **OVE-105** | Import 1 — Foundation: schema, storage, intake & staging + entry UI | — | `wtrhodesdev/ove-105-import-1-foundation-schema-storage` |
| **OVE-106** | Import 2 — Text extraction + first full review & confirm (vertical) | OVE-105 | `wtrhodesdev/ove-106-import-2-text-extraction-first-full` |
| **OVE-107** | Import 3 — PDF support through the same flow | OVE-106 | `wtrhodesdev/ove-107-import-3-pdf-support-through-the-same` |
| **OVE-108** | Import 4 — Screenshot & photo support (incl. handwriting) | OVE-107 | `wtrhodesdev/ove-108-import-4-screenshot-photo-support-incl` |
| **OVE-109** | Import 5 — Reliability, cost & privacy controls + golden-set eval | OVE-108 | `wtrhodesdev/ove-109-import-5-reliability-cost-privacy` |
| **OVE-110** | Import 6 — User guidance (tour + What's New) & launch handoff | OVE-109 | `wtrhodesdev/ove-110-import-6-user-guidance-tour-whats-new` |

Vertical slices, each a medium-large PR-sized chunk, chained in build order (blueprint §9). OVE-110
is the final visible-change ticket (uses `overload-onboarding`).

## Deferrals / owner gates (accumulating)

- Monthly global AI spend cap amount — owner decision; implement configurable, fail-closed if missing.
- Approval to send real user uploads to Anthropic — owner decision.
- Production migration application — human runbook step.
- Real-provider golden-set evaluation spend — owner authorization required.

## Branches / PRs

- **Feature branch:** `22-workout-plan-import-review` (off `main`).
- **Feature PR:** [#130](https://github.com/troyrhodes02/overload-training/pull/130) — *DO NOT MERGE* (owner approval). Base commit: planning artifacts.
- Ticket branches/PRs captured below as implemented.

| Ticket | PR | Status | Verification |
| -- | -- | -- | -- |
| OVE-105 | [#131](https://github.com/troyrhodes02/overload-training/pull/131) | ✅ squash-merged into feature (`d4da39b`) | lint/typecheck/format ✅, unit 1588 ✅, integration 754 ✅ (migration `9l_plan_import`), build ✅, client-bundle ✅ |
| OVE-106 | [#132](https://github.com/troyrhodes02/overload-training/pull/132) | ✅ squash-merged into feature (`c4e1ab6`) | lint/typecheck/format ✅, unit 1742 (119 shorthand fixtures) ✅, integration 769 ✅, build ✅, client-bundle ✅ |
| OVE-107 | [#133](https://github.com/troyrhodes02/overload-training/pull/133) | ✅ squash-merged into feature (`a92f16b`) | lint/typecheck/format ✅, unit 1762 ✅, integration ✅, build ✅, client-bundle ✅ (`pdfjs-dist@6.5.438`) |
| OVE-108 | [#134](https://github.com/troyrhodes02/overload-training/pull/134) | ✅ squash-merged into feature (`bf7749d`) | lint/typecheck/format ✅, unit 1778 ✅, integration 774 ✅ (isolation), build ✅, client-bundle ✅ (`sharp@0.34.4`, `heic-convert@2.1.0` server-external) |
| OVE-109 | — | 🔄 in progress | — |
| OVE-110 | — | ⬜ | — |

OVE-106 facts: `@anthropic-ai/sdk@1.6.0` + `zod@4.6.5` pinned; structured output via
`messages.parse()` + `zodOutputFormat` over a `.strict()` `ExtractedPlanObservation`; model id from
env `PLAN_IMPORT_MODEL` (default `claude-opus-4-8`, owner-overridable — NOT hardcoded as fact, RD-11);
`promptVersion="2026-11-07.1"`; model call outside any tx; provider mocked in all tests (real accuracy
unverified, owner-gated). New owner env: `PLAN_IMPORT_MODEL`, `PLAN_IMPORT_MONTHLY_SPEND_MICROS`
(fail-closed when unset), `ANTHROPIC_API_KEY`. Confirm reuses existing writers in one tx, idempotent
via unique `mesocycleId`, zero LoggedSet/history/baseline writes. Image/PDF byte extraction stubbed
(text ships fully; file parts evidence-only) → OVE-107/108.

OVE-108 facts: `sharp@0.34.4` (orient/EXIF-strip/resize/re-encode) + `heic-convert@2.1.0` (HEVC-HEIC
decode; bundled sharp libheif lacks HEVC) — both pinned, `serverExternalPackages`, server-only.
Deviation (recorded): server-side normalization is the authority; client-side pre-processing skipped
to keep image deps off the client bundle (spec allowed "may be client-side"). ⚠️ **Flaky-under-
concurrency:** `import-pdf` integration tests showed 4 failures only when the integration suite runs
concurrently (embedded-Postgres contention) — green in isolation and when run alone. **Confirm at
Step 11 full-verification** (run integration serially / default config).

OVE-105 deviations recorded: HEIC/EXIF stubbed (HEIC cleanly refused) → OVE-108; one raw-allowed
module `src/lib/import/usage.ts` (atomic owned-table quota, pinned to `import_usage_days` by the guard
test) — anticipated by spec RD-9.

### Process decision (RD-impl-integration)
Run prompt Step 8 says "each next branch off the preceding ticket branch" and Step 10 "squash-merge
all ticket PRs into the feature branch in order." To keep each ticket PR a clean single-ticket diff
and avoid stacked cumulative diffs, this run branches each ticket off the **current feature-branch
HEAD**, verifies, then squash-merges it into the feature branch before starting the next ticket.
End state is identical to Step 10 (ticket PRs integrated into the feature branch in order; feature PR
open; stop before main). Minor process deviation, recorded here and in the report. Authority: run
prompt intent + cleaner-diff judgment.

### Implementation guardrails (every ticket)
Isolated embedded-Postgres (`test:integration`) only; mocked Anthropic provider + mocked Storage;
NO connection to prod Supabase ref `ycxvdiklpefyhdclxyau`; NO real paid model calls; NO prod writes;
per-commit lint/typecheck/format:check/unit, per-ticket + build; verification honesty (unverified ≠ passed).

---

# OVE-106 — Text extraction + first full review & confirm (vertical slice 2)

Branch: `ove-106-text-extraction-review-confirm` off `22-workout-plan-import-review`. STOP BEFORE MERGE.
Builds on the already-merged OVE-105 foundation (schema/migration `9l_plan_import`, models, storage/usage/sessions,
intake actions + UI, scope/deletion/export registration). OVE-106 is application-layer only — no schema change.

## Resolved Decisions (OVE-106)

- RD-11: AI adapter uses `@anthropic-ai/sdk` (TypeScript), pinned. Model id read from env `PLAN_IMPORT_MODEL`
  with default `claude-opus-4-8` (current per the claude-api skill). Structured output via `messages.parse()` +
  `output_config.format` (zodOutputFormat) against a strict Zod schema; `additionalProperties:false`. Adaptive
  thinking omitted (deterministic extraction). promptVersion `"2026-11-07.1"`. Provider MOCKED in all tests;
  no real paid call ever made by this run.
- RD-106a: Spend ledger raw-allowed module `src/lib/import/spend.ts` (atomic reserve/reconcile upsert, fail-closed).
  Added to eslint ignore list; `ImportSpendLedger` already in UNOWNED_SYSTEM_MODELS (OVE-105).
- RD-106b: The DTO in spec §13 (FieldStatus explicit|derived|missing|ambiguous|needed|user_edited) is the client
  contract. Internal observation (blueprint §3.4) maps → ImportDraft (stored JSON) → ImportDraftDto (sent to client).
- RD-106c: Spend cap env `PLAN_IMPORT_MONTHLY_SPEND_MICROS` + price map — fail closed when unset (import_unavailable).
  Per-attempt estimate is a conservative constant; the owner-set cap amount stays an Open Question (§17.1).

## Files

- src/lib/import/parse/shorthand.ts — pure shorthand parser (sets/reps/AMRAP/@%/RPE/RIR/rest/tempo/bodyweight), units
- src/lib/import/match/matcher.ts — library matcher (norm/alias/bounded fuzzy) → matched/ambiguous/unknown
- src/lib/import/draft/{types,build,evidence}.ts — ImportDraft + DTO + blockers + quote-to-source
- src/lib/import/extraction/{port,schema,prompt,anthropic,mock,index}.ts
- src/lib/import/spend.ts — spend ledger (raw-allowed)
- src/lib/import/extract.ts — lifecycle begin/retry/status, lease CAS, request-owned task
- src/lib/import/confirm.ts — one-tx confirm via existing writers, idempotent
- src/lib/import/review.ts — saveDraftEdit/resolveMatch/stageCustom
- src/app/(app)/plan/import/actions.ts — extended with new actions
- UI client islands: processing/review/done; page wiring
- tests: tests/unit/import-*.test.ts, tests/integration/import-*.int.test.ts, isolation extension

## Verification (run honestly at the end)

lint, typecheck, format:check, test, test:integration, build, verify:client-bundle. Real-provider accuracy UNVERIFIED (owner-gated).

## OVE-106 status: COMPLETE (pending PR / owner review)

All files built. Verification (run honestly):
- lint: PASS (0 errors) · typecheck: PASS · format:check: PASS
- unit: PASS (1742/1742, incl. 119 shorthand fixtures) · integration: PASS (769/769)
- build: PASS · verify:client-bundle: PASS (no secret in bundle)
- Real-provider extraction accuracy: UNVERIFIED (owner-gated — no paid call made).
Deps added+pinned: @anthropic-ai/sdk@1.6.0, zod@4.6.5.
STOP BEFORE MERGE. PR opened against 22-workout-plan-import-review.

---

# OVE-109 Progress — Import 5: Reliability, cost & privacy controls + golden-set eval

Branch: `ove-109-reliability-cost-privacy` off `22-workout-plan-import-review`. STOP BEFORE MERGE. MOCK provider. No real paid calls.

## Status: IN PROGRESS

## Already shipped by earlier slices (verified by reading code)
spend reserve/reconcile/release (spend.ts, fail-closed); daily quota atomic counter (usage.ts, fail-closed, started-attempt); kill switch default-OFF enforced in guardImport() on every action; lease CAS + stale reclaim + bounded attempts + retry (extract.ts); idempotent confirm one-tx zero-history (confirm.ts); confirm/discard cleanup + account-deletion stored-object sweep (deletion.ts); scope.ts UNOWNED_SYSTEM_MODELS has ImportSpendLedger; eslint raw-allow for usage.ts+spend.ts.

## Gaps THIS ticket completes
1. Lazy per-request expiry sweep — src/lib/import/retention.ts (acting account's OWN overdue unconfirmed sessions). NEW.
2. Retriable blob-delete tombstone — add `sourcesPurgedAt` column to ImportSession (additive migration). NEW.
3. Operator cleanup script scripts/operator/plan-import-cleanup/ (dry-run default, loopback-only, one tx). NEW.
4. Privacy hardening — ANTHROPIC_API_KEY + PLAN_IMPORT_* tokens in check-client-bundle.mjs; log/DTO audit. NEW.
5. Golden-set eval harness tests/fixtures/import-golden/ >=50 synthetic fixtures + eval runner. Mocked default; real-provider owner-gated → unverified. NEW.
6. Tests for all of the above + threat tests.

## Decisions
- RD-A: Tombstone = ImportSession.sourcesPurgedAt nullable column, not a new table (reuses existing RLS/scope/deletion/export). Authority: own judgment; spec §17 leaves tombstone shape open.
- RD-B: Lazy sweep scoped to acting account only; global purge is the operator script's job. Authority: account-isolation invariant.

## Retention posture (RD-13)
Implemented: lazy per-request sweep, confirm/discard cleanup, account-deletion sweep, retriable tombstones, operator script. BLOCKED: reliable <=24h *scheduled* purge of abandoned-never-reopened sessions — no scheduler/cron/queue (architecture non-goal). Documented in-code + report. NOT building cron.

## Stop conditions: none hit.

## OVE-109 status: implementation COMPLETE (pending full integration pass + PR)

Built:
- schema: ImportSession.sourcesPurgedAt (tombstone) + migration 9m_plan_import_retention (additive; RLS already on; partial index).
- src/lib/import/retention.ts — sweepExpiredImports / retryTombstones / runImportRetention (account-scoped, bounded, non-throwing).
- confirm.ts cleanupSources sets sourcesPurgedAt on success; leaves tombstone on failure.
- page.tsx wires runImportRetention after capability check.
- extract.ts: finished stale-extracting reclaim — beginExtraction resumes a live lease (idempotent) and reclaims an expired one; claimLease threshold aligned (leaseExpiresAt < now) so no dead zone.
- storage.ts signSourceReadUrls now resilient (never throws; nulls on failure).
- scripts/check-client-bundle.mjs: ANTHROPIC_API_KEY + PLAN_IMPORT_* tokens + key value.
- scripts/operator/plan-import-cleanup/{cleanup,cli}.ts + npm script plan-import:cleanup (dry-run default, loopback-only, one tx).
- tests/fixtures/import-golden/ (55 synthetic fixtures, all 5 kinds + hard cases) + runner + eval.
- tests: import-golden-eval, import-privacy (unit); import-retention, import-spend, import-hardening, import-threats, plan-import-cleanup (integration).

Verification so far: typecheck PASS, lint PASS (0 err), format:check PASS, unit PASS (1811), golden-eval 55 fixtures 0 hallucinations. Integration full-suite running. build + verify:client-bundle pending.
