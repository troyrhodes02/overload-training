# Pitch 22 — Workout Plan Import & Review — Run Report

**Run completed:** 2026-11-08 (started 2026-11-07)
**Policy:** Autonomous Pipeline Policy (`CLAUDE.md`). Merge behavior: **STOP BEFORE MERGE** — honored.
**Outcome:** ✅ **Ready for owner verification**, subject to the manual gates below. **Not** production-ready and **not** live-AI-ready (both require owner action). No stop condition was hit.

---

## 1. What shipped

An account-private, **Pro-gated** (`plan_import`), source-grounded, editable, confirmable plan importer that turns a plan the lifter already wrote — **pasted text, text PDF, scanned PDF, screenshots, or photos (incl. handwriting)** — into a **draft `Mesocycle`** through **one** review-and-confirm flow, created only on explicit confirmation via the **existing** plan-creation writers. Model observes, code decides, nothing missing is guessed. Everything is bounded by caps, a per-account daily quota, a fail-closed global spend reservation, and a default-OFF kill switch, with private per-account source storage and lazy/deletion-time retention cleanup.

**Both source documents were consumed in full** (pitch 11 sections + P22-01..10 matrix; blueprint 12 sections incl. state/security/testing) and kept **separate** in the repo:
- Pitch → `pitches/22-workout-plan-import-review.md`
- Blueprint → `docs/technical/22-workout-plan-import-extraction-blueprint.md`
- Design → `docs/design/22-workout-plan-import-review-design-doc.md`
- UI preview (binding) → `docs/previews/22-workout-plan-import-review-preview.tsx`
- Spec (+ Resolved Decisions) → `docs/specs/22-workout-plan-import-review-spec.md`
- Runbook → `docs/runs/22-workout-plan-import-review-runbook.md`
- Progress → `docs/runs/22-workout-plan-import-review-progress.md`

## 2. Feature PR, tickets, merge status

- **Feature PR:** [#130](https://github.com/troyrhodes02/overload-training/pull/130) — **OPEN, base `main`, NOT merged** (DO NOT MERGE; owner approval).
- **Feature branch:** `22-workout-plan-import-review` (HEAD `3ca4b02` after review fixes).
- **`main`:** untouched (`963c8ae`).
- **Milestone:** Workout Plan Import & Review (Overload V1).

| Ticket | Title | PR | Integrated into feature |
| -- | -- | -- | -- |
| OVE-105 | Foundation: schema, storage, intake & staging + entry UI | [#131](https://github.com/troyrhodes02/overload-training/pull/131) | ✅ squash-merged |
| OVE-106 | Text extraction + first full review & confirm | [#132](https://github.com/troyrhodes02/overload-training/pull/132) | ✅ |
| OVE-107 | PDF support through the same flow | [#133](https://github.com/troyrhodes02/overload-training/pull/133) | ✅ |
| OVE-108 | Screenshot & photo support (incl. HEIC/handwriting) | [#134](https://github.com/troyrhodes02/overload-training/pull/134) | ✅ |
| OVE-109 | Reliability, cost & privacy controls + golden-set eval | [#135](https://github.com/troyrhodes02/overload-training/pull/135) | ✅ |
| OVE-110 | User guidance (tour + What's New) & launch handoff | [#136](https://github.com/troyrhodes02/overload-training/pull/136) | ✅ |

Ticket PRs are squash-merged **into the feature branch in build order**; the feature PR stays open. (Process note: each ticket branched off the current feature HEAD and was squash-merged before the next started — functionally identical to Step 10's "integrate in order," with cleaner single-ticket diffs. Recorded as a minor deviation.)

## 3. Verification results (honest)

**Final integrated feature branch (`3ca4b02`):**

| Check | Result |
| -- | -- |
| `lint` | ✅ pass |
| `typecheck` | ✅ pass |
| `format:check` | ✅ pass |
| `verify:client-bundle` (secrets out of client bundle) | ✅ pass |
| `test` (unit) | ✅ **1818 passed** |
| `build` | ✅ pass |
| `test:integration` (embedded Postgres) | ✅ **804 passed** |

**Integration flake — root-caused and FIXED.** `tests/integration/import-pdf.int.test.ts` was intermittently failing (page-count / text-vs-vision assertions) **only under the full 77-suite serial run** — a non-deterministic `pdfjs-dist` ESM parser degradation under accumulated single-worker heap pressure (it always passed 5/5 in isolation and in small groups; the code is correct). **Fix:** added `workerIdleMemoryLimit: "512MB"` to `jest.integration.config.js` so the single worker recycles its heap before a late suite runs. **Confirmed green on two consecutive full runs (804/804, exit 0) after the fix.** No assertion was weakened, skipped, or disabled.

## 4. Acceptance criteria matrix (P22-01 … P22-10)

Legend: **unit** / **integration** = covered by those tests on isolated infra with the provider **mocked**; **real-model** / **browser** = **not run** (owner-gated / unattended); **blocked** = infra gap.

| AC | Status | Evidence / caveat |
| -- | ------ | ----------------- |
| **P22-01** pasted plan → accurate editable draft | ✅ unit + integration (mocked) | 119 shorthand fixtures + golden-set (text) mocked. Real-provider accuracy **not verified** (owner-gated). |
| **P22-02** PDF/scan/screenshot/photo → same draft shape; errors handled | ✅ unit + integration (mocked) | per-kind normalization + file-handling tests. Scanned-PDF/handwriting accuracy **not verified** (real provider). |
| **P22-03** evidence-linked facts; source instructions inert; unresolved stays visible | ✅ unit + integration | injection-as-data, strict schema, quote-to-source, status chips. |
| **P22-04** correct/resolve/confirm; abandoned never persists; stale removed in retention | ⚠️ **Partial** | field/match/confirm + lazy/discard/account-deletion cleanup **full**; the ≤24h **scheduled** purge is **BLOCKED** (no scheduler — §7). |
| **P22-05** confirm via existing path, appears in Split & Mesocycle, idempotent; history unchanged | ✅ integration | one tx via existing writers; unique `mesocycleId`; **zero** LoggedSet/baseline/history writes asserted. |
| **P22-06** Free denied via direct call; Pro/trial/comp allowed; lapsed keeps plan | ✅ integration | `requireCapability` at start/upload/extract/confirm; Free/anon → `plan_required`. |
| **P22-07** caps/budget/kill-switch/timeout-retry; disabled fails cleanly | ⚠️ **Partial** | enforcement **full** (fail-closed, race-safe); monthly **cap amount** + real-provider consent are **owner gates** (fail-closed without them). |
| **P22-08** B can't read/alter/confirm/download A's import; RLS denies; no admin exposure | ✅ integration | scope layer + deny-all RLS on all 4 tables + admin exclusion; foreign id → not-found. |
| **P22-09** mobile+desktop accessible; preview implemented; guidance + What's New | ⚠️ **Partial** | implementation + tour step + release note **done**; **on-device mobile + browser E2E not run** (unattended) → unverified. |
| **P22-10** synthetic fixture eval across five kinds; mocked vs real separated | ⚠️ **Partial** | **55 synthetic golden fixtures**, 0 hallucinations on the mocked set; **real-provider measurement not run** (owner budget) → unverified. |

**No AC is falsely claimed.** Handwriting, scanned-PDF accuracy, and production deletion behavior are explicitly **not** marked passed.

## 5. New external dependencies (with rationale)

| Dependency | Version | Rationale | Client-safe |
| ---------- | ------- | --------- | ----------- |
| `@anthropic-ai/sdk` | 1.6.0 | Server-side extraction (pre-decided in architecture). Structured output via `messages.parse()` + `zodOutputFormat`. | server-only (verified by `verify:client-bundle`) |
| `zod` | 4.6.5 | Strict `.strict()` observation schema (model-facing contract). | shared |
| `pdfjs-dist` | 6.5.438 | PDF page count + text-layer extraction (pure JS, no native binaries; legacy ESM build). | server-only; `serverExternalPackages` |
| `sharp` | 0.34.4 | Image orient/EXIF-strip/resize/re-encode. | server-only; `serverExternalPackages` |
| `heic-convert` | 2.1.0 | HEVC-HEIC decode (bundled sharp libheif lacks HEVC). | server-only; `serverExternalPackages` |

**Model id is NOT hardcoded as fact** (RD-11): read from env `PLAN_IMPORT_MODEL` (default `claude-opus-4-8`, owner-overridable); exact id/price to be confirmed by the owner at enablement.

## 6. Schema / migrations / data model

- **New tables (migration `9l_plan_import`):** `import_sessions`, `import_source_parts`, `import_usage_days` (owned; `userId`, deny-all RLS, FK-RESTRICT→profiles, immutable + same-owner triggers, CHECK caps), `import_spend_ledger` (un-owned system table, deny-all RLS).
- **Migration `9m_plan_import_retention`:** additive nullable `sources_purged_at` on `import_sessions` (retention tombstone).
- **Registration:** owned models auto-scope via DMMF; `ImportSpendLedger` in `UNOWNED_SYSTEM_MODELS`; all three owned models in `ACCOUNT_DELETION_ORDER` (+ stored-object sweep) and `export.ts` (metadata/draft only — no bytes/secrets/lease).
- **No plan-model column added** — load/rest/tempo/%/RPE/superset are review-only context, dropped on confirm.
- Migrations are **authored and verified on isolated embedded Postgres only**; production application is a human runbook step (§7, G4).

## 7. Owner gates / unresolved decisions (none guessed)

| # | Decision | Status | Effect |
| - | -------- | ------ | ------ |
| G1 | **Monthly AI spend cap amount** (`PLAN_IMPORT_MONTHLY_SPEND_MICROS`) | **Owner** | Imports fail closed until set. Not guessed. |
| G2 | **Consent to send real uploads to Anthropic** + data-processing terms | **Owner** | Real-provider calls off until approved. |
| G3 | **≤24h scheduled-purge infrastructure** (no scheduler exists) | **Owner / infra** | P22-04 retention **partially blocked**; lazy/discard/deletion cleanup is implemented. Vercel Cron would contradict the current architecture non-goal → owner decision + planning-doc amendment. |
| G4 | **Production migration application** (with backup) | **Human** | `9l` + `9m` not applied to prod by the run. |
| G5 | **Real-provider golden-set eval authorization** + quality/hallucination threshold | **Owner** | Accuracy unverified until a budgeted eval runs. |

## 8. Privacy & retention status

- **Private** per-account bucket `plan-import-sources` (service-role, deny-all, owner-prefixed keys, signed short-TTL READ URLs, **no public URL**). Magic-byte validation independent of client MIME; EXIF/GPS stripped; HEIC convert-or-refuse. Raw **bytes** (not signed URLs) sent to the provider.
- **No admin surface** for import sources/drafts; **no leaks** (no source bytes/filenames/prompt bodies/page-images in logs, errors, or DTOs); all untrusted display content escaped.
- **Retention implemented:** cleanup on confirm/discard, lazy per-request sweep of the acting account's own expired sessions, account-deletion stored-object sweep, retriable blob-delete tombstones, operator cleanup script (dry-run default, loopback-only). **Scheduled ≤24h guarantee: BLOCKED** (G3) — not falsely claimed.

## 9. Resolved Decisions (incl. guessed numeric caps)

Full list in the spec §Resolved Decisions (RD-0..RD-17) and the progress file. Highlights:
- **RD-0 slug** `22-workout-plan-import-review` (pitch-number) — see §11 amendment on the repo's slug-lag convention.
- **RD-cap** gate on the already-reserved `plan_import` capability (no entitlement change).
- **RD-3** source load/rest/tempo/%/RPE/superset are review-only context, dropped on confirm (plan model has no field).
- **RD-4/RD-5** confirm creates a **draft** mesocycle via the existing writers in one tx; idempotent via unique `mesocycleId`.
- **RD-12 adopted constants:** 20,000 chars; 5 imports/account/day; 24h unconfirmed retention target.
- **RD-12 guessed Bucket-C caps (require owner validation):** 5 files; 10 MiB/file; 25 MiB/import; 20 PDF pages; 2000–2400px resize; 14 days / 20 exercises-per-day / 15 sets-per-exercise.
- **RD-13** retention is implementable-parts-only; scheduled purge owner/infra-gated.
- **RD-15** the blueprint's "one escalation to a stronger model" is **deliberately deferred** (mock-first; real-provider owner-gated; unbudgeted model behavior) — recorded, not silently dropped.
- **RD-16** image-resize floor constant dropped (unused). **RD-17** real-token pre-call spend estimate deferred (needs owner price map).

## 10. Review findings & dispositions (Step 12–13)

10 inline comments on PR #130. Core invariants **verified holding** (isolation, zero-LoggedSet/baseline, fail-closed cost, no-leak privacy, source-as-data, idempotent confirm, retention honesty).

**Implemented (8):** intra-day duplicate-exercise blocker (`DUPLICATE_EXERCISE_IN_DAY` — the near-blocker; surfaces the `@@unique([sessionId,exerciseId])` limitation instead of a dead-end rollback); confirm `$transaction` timeout (120s); concurrent-confirm returns the same `mesocycleId`; daily-quota refund on lost-lease race; spend reconcile sign fix; normalized `sizeBytes` stamping; release orphaned reservation on discard of a dead-lease extracting session; dead-constant/stale-comment cleanup. **Deferred (1):** real-token spend estimate (RD-17). **Skipped (1):** HEIC brand allowlist broadening (conservative refuse-and-ask is the intended safe default). New regression tests added for each fix; source fidelity + invariants re-checked after.

## 11. Required upstream amendments (NOT edited during the run)

1. **Roadmap/PRD text-only deferral superseded.** Roadmap Pitch 22 "Defers: Files, PDFs, photos, screenshots" and the PRD's paste-only framing are overridden by the owner-approved file/image scope expansion. Record in `docs/planning/pitch-roadmap.md` + `prd.md`.
2. **Slug convention.** Repo artifacts historically lag the pitch number by one (Pitch 21 → slug 20); this run uses the pitch-number slug `22-...` per the run prompt. Note the convention going forward.
3. **iOS sequencing.** The roadmap sequences the iOS foundation before some commercial pitches; this run is responsive-web-only with native deferred. Record the dependency note.
4. **Scheduler non-goal vs. retention guarantee.** A reliable ≤24h scheduled purge needs scheduling infra the architecture currently excludes; the owner's G3 decision may require a planning-doc amendment. (`docs/planning/method-note.md` was extended during the run with the Pitch-22 constants per policy.)

## 12. Safety, near-misses, and honesty notes

- **No stop condition hit.** No invariant weakened; no `LoggedSet`/history/baseline write; all import tables RLS-protected and scoped; no account could see another's import; `plan_import` enforced server-side; no secret in a client bundle; no admin view of import content; no card data touched.
- **Near-miss caught in review:** intra-day duplicate exercise would have been a silent permanent dead-end — fixed with an explicit blocker.
- **No production contact:** verified the local env points at the Supabase **local stack** (`127.0.0.1`), not prod ref `ycxvdiklpefyhdclxyau`; Stripe keys are test-mode; integration tests use throwaway embedded Postgres; the Anthropic provider was **mocked in every test** — **no real paid model call was made**, and no real-provider accuracy is claimed.
- **Verification honesty:** the `import-pdf` flake, all owner-gated unverified items, and the blocked scheduled-purge are reported as such, never as passed.

## 13. Manual runbook steps (owner)

See `docs/runs/22-workout-plan-import-review-runbook.md` — isolated-test proof, human prod migration (`9l`+`9m`) with backup, private bucket + provider setup + data-terms review, budget/kill-switch/rollback, cap validation, retention monitoring + the blocked scheduled-purge decision, owner-authorized golden-set real-provider eval, browser/mobile E2E, Pro/Free checks, cost-anomaly response, and the Pitch 23 launch gates.

## 14. State at handoff

Ready for **owner verification** on a preview deployment with ≥2 accounts (per CLAUDE.md, this touches ownership/scoping/auth-adjacent and schema). The feature PR remains open and unmerged. Enabling production import, applying the migration, setting the spend cap, consenting to real-provider calls, and any release are **owner/human** steps. Nothing here is production-ready or live-AI-ready without those gates.
