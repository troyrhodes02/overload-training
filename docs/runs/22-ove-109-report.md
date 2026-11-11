# OVE-109 Run Report — Import 5: Reliability, cost & privacy controls + golden-set evaluation

Pitch 22, vertical slice 5. Branch `ove-109-reliability-cost-privacy` off `22-workout-plan-import-review`. **STOP BEFORE MERGE** (observed). MOCK provider only; no real paid call.

## What shipped

This slice **completed and hardened** the reliability/cost/privacy controls earlier slices seeded, and added the golden-set evaluation harness. Much of the groundwork (spend ledger reserve/reconcile, daily quota counter, kill switch, lease CAS, idempotent confirm, account-deletion sweep, deny-all RLS, scope registration) already existed from OVE-105–108; this ticket finished the genuinely missing pieces:

- **Durable recovery.** Finished stale-`extracting` lease reclaim. `beginExtraction` now resumes a **live** lease (idempotent status report, interruption-safe) and reclaims an **expired** one via the compare-and-set claim; a prior crashed attempt can never overwrite the winner (CAS on `leaseToken`). Aligned `claimLease`'s reclaim threshold to `leaseExpiresAt < now` so there is no dead zone between "reported in-progress" and "reclaimable". Bounded attempts and the retry path were already present.
- **Cost governance.** Confirmed the global reserve-before / reconcile-after against `ImportSpendLedger` is fail-closed and race-safe, and added the tests that prove it (concurrent pair cannot both reserve past the ceiling; fail-closed on missing cap). Daily quota (started-attempt, idempotent retries not double-counted) and the `PLAN_IMPORT_ENABLED` kill switch on every model-triggering path were already enforced; added forged-direct-call tests (6th/day refused; fail-closed).
- **Retention & cleanup.** New `src/lib/import/retention.ts`: lazy per-request sweep of the acting account's OWN expired unconfirmed sessions (delete draft + parts + stored objects, transition to `purged`), plus `retryTombstones`. Wired `runImportRetention` into `/plan/import`. New **retriable blob-delete tombstone** = `ImportSession.sourcesPurgedAt` (nullable column, migration `9m_plan_import_retention`, additive, RLS already on): a terminal session with remaining objects and a null marker is observable and retriable; confirm/discard/sweep set it only on full success, and a failed delete never undoes a confirmed plan. New **operator cleanup script** `scripts/operator/plan-import-cleanup/` (default dry-run, loopback-only, names scope, one tx) mirroring the founding-members conventions, plus `npm run plan-import:cleanup`.
- **Privacy hardening.** Added `ANTHROPIC_API_KEY` + `PLAN_IMPORT_*` tokens (and the provider key value) to `verify:client-bundle`. Audited the import tree: no `console.*` of source bytes/filenames/prompt bodies/page images; error codes are a closed set of safe categories; DTOs carry no paths/filenames. `signSourceReadUrls` made non-throwing (nulls on failure), honoring its documented contract.
- **Golden-set evaluation harness.** `tests/fixtures/import-golden/` with **55 synthetic** ground-truth fixtures across all five source kinds (pasted text, text PDF, scanned PDF, screenshot, photo/handwriting) plus tables, multi-column, mixed units, supersets, handwriting, illegibility, non-plans, injection, week-by-week. An eval runner computes per-field precision/recall (day labels, sets, rep ranges), explicit-missing accuracy, ambiguity recognition, **hallucination rate**, catalog accuracy, and cost/latency per kind. Runs against the MOCK provider by default; real-provider mode is gated behind `PLAN_IMPORT_GOLDEN_REAL=authorized` and reported **unverified** when unset. Mocked and real evidence are kept separate (`EvalReport.mode`).

## Retention posture (P22-04, RD-13)

**Implemented:** lazy per-request sweep, cleanup on confirm/discard, account-deletion stored-object sweep, retriable blob-delete tombstones, operator cleanup script. **BLOCKED (owner/infra):** a reliable ≤24h *scheduled* purge of abandoned-never-reopened sessions, because the repo deliberately has no scheduler/cron/queue (architecture non-goal). Not silently added. The operator script is the manual stand-in. P22-04 retention remains **partially blocked**, not passed.

## Decisions made on the user's behalf

- **RD-A:** Tombstone is a nullable `ImportSession.sourcesPurgedAt` column, not a new table — a new owned table would need its own RLS/scope/deletion/export; a hygiene marker on the existing owned row reuses all of that. Authority: own judgment; spec §17 leaves the tombstone shape open.
- **RD-B:** Lazy sweep is scoped to the acting account only; the global purge is the operator script's job. Authority: account-isolation invariant.
- **RD-C:** `claimLease` reclaim threshold simplified to `leaseExpiresAt < now` (was `< now − TTL`) so the guard and the CAS agree. Authority: own judgment; RD-10 (compare-and-set lease).

## Verification (honest)

- `lint`: PASS (0 errors, 0 warnings). `typecheck`: PASS. `format:check`: PASS.
- `test` (unit): PASS (1811 pre-existing + new golden-eval/privacy suites).
- Golden-set: 55 synthetic fixtures, all 5 source kinds + 9 hard-case dimensions; **0 hallucinations**, explicit-missing and ambiguity recognition 100% on the synthetic set (mocked).
- `test:integration`: PASS (77 suites, 797 tests) on a clean single-worker run, including the new import-retention / import-spend / import-hardening / import-threats / plan-import-cleanup suites. (One earlier full run showed 4 transient `import-pdf` failures that did not reproduce in isolation or in three subsequent full runs — embedded-Postgres contention, the flakiness the ticket flags; the final clean run is green.)
- `build`: PASS. `verify:client-bundle`: PASS (no server secret in `.next/static`).
- **Real-provider golden-set accuracy: UNVERIFIED** (owner budget + consent gate; no paid call made). Browser E2E across source kinds: **unverified** unattended (no real provider/file infra).

## Spec deviations

None material. The tombstone column is an additive schema change the spec anticipated ("retriable blob-delete tombstones") without fixing a shape; recorded as RD-A.

## Stop conditions

None hit. No scheduler/cron/queue added. No `LoggedSet`/history/baseline write. No new owned table (tombstone is a column on an existing owned table). No production DB/credentials touched; provider mocked; no real charge. No merge.
