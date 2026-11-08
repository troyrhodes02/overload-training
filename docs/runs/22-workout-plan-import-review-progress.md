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
| 7 | Feature PR | 🔄 in progress |
| 8 | Implement all tickets | ⬜ pending |
| 9 | Operator runbook | ⬜ pending |
| 10 | Integrate ticket PRs into feature branch | ⬜ pending |
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

_None yet._
