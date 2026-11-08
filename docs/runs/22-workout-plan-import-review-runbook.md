# Pitch 22 — Workout Plan Import & Review — Operator Runbook

**Audience:** The product owner (operator) performing the manual, human-only steps the unattended
pipeline deliberately did not perform. Nothing here was executed by the run.

**Status at handoff:** Feature PR [#130](https://github.com/troyrhodes02/overload-training/pull/130)
open and **unmerged**. All ticket PRs (OVE-105..110) integrated into the feature branch. Verified on
isolated embedded-Postgres + mocked provider/storage. **No** production migration, real-provider call,
or spend activation has occurred.

> ⛔ **Protected environment.** Supabase project ref `ycxvdiklpefyhdclxyau` is **Production**, and was
> used from local/Preview during an earlier cutover. Treat ANY connection to it as live. Do not point
> tests, seeds, uploads, imports, or model evaluation at it. All steps below that touch production are
> **owner/human** steps, done deliberately, with a backup.

---

## 0. Owner decisions required before ANY real use (gates)

The feature is built to **fail closed** until each of these is satisfied. None may be guessed.

| # | Decision | Why it blocks | Where it's wired |
| - | -------- | ------------- | ---------------- |
| G1 | **Monthly global AI spend cap (USD).** | Imports are disabled unless a cap is configured; the code reserves estimated cost before each call and fails closed when the cap/price-map is missing. | `IMPORT_MONTHLY_BUDGET_*` env + `ImportSpendLedger`; see §4 |
| G2 | **Consent to send real user uploads to Anthropic** + reviewed data-processing terms (storage region, deletion, subprocessors). | Real-provider calls are off until the owner approves sending personal photos/PDFs to a third party. | provider enablement; §3 |
| G3 | **≤24h scheduled-purge infrastructure decision.** The repo has **no scheduler/cron/queue** (deliberate architecture non-goal). The reliable scheduled purge of abandoned-never-reopened sessions cannot be guaranteed by the implemented parts alone. | Retention AC (P22-04) is **partially blocked** until this is decided. | §6 |
| G4 | **Production migration application** (with backup). | New tables/RLS must reach prod by a human runbook step, never the run. | §2 |
| G5 | **Real-provider golden-set evaluation authorization** + an owner-reviewed quality/hallucination threshold before enabling for real users. | Accuracy is **unverified** until a budgeted eval runs; mocks don't prove provider quality. | §7 |

Until G1–G5 are satisfied, keep `PLAN_IMPORT_ENABLED` unset/`false` in Production.

---

## 1. Isolated test setup (proof it is NOT production)

- Integration tests run on **embedded Postgres** (`embedded-postgres`, auto-provisioned) via
  `npm run test:integration`. It creates a throwaway local DB and applies migrations fresh; it never
  reads `DATABASE_URL`/`DIRECT_URL` for production.
- The Anthropic provider is **mocked** in all automated tests (`PlanExtractionPort` fake). No network
  call leaves the machine. Storage is mocked/stubbed; no real bucket I/O in tests.
- **Verify isolation before any local run:** confirm `DATABASE_URL`/`DIRECT_URL`/
  `NEXT_PUBLIC_SUPABASE_URL` do **not** contain `ycxvdiklpefyhdclxyau`. If they do, stop — you are
  pointed at production. Use the local Supabase CLI stack (`npx supabase start`) for any manual UI run.
- Do **not** run the import flow end-to-end (upload/model) against the production project.

## 2. Applying the schema migration to Production (human, G4)

1. Take a fresh production database **backup** immediately before (and verify it restores).
2. Review the migration `prisma/migrations/<n>_plan_import/migration.sql` — confirm it only **creates**
   the four import tables, enables deny-all RLS on each, and adds FKs/triggers/CHECKs. It must not
   alter or drop any existing table/column.
3. Apply with the **direct** connection (`DIRECT_URL`) using the project's standard migration path
   (`prisma migrate deploy`), from the runbook, by a human — never the pipeline.
4. Post-apply checks: all four tables exist with RLS **enabled and no policies** (the anon Data API
   returns nothing); the `overload_user_id_immutable` and `overload_assert_same_owner` triggers are
   present on the owned tables; `import_sessions.mesocycle_id` is unique.
5. If anything looks wrong, restore from the backup. There is no staging tier.

## 3. Private storage bucket + provider setup (G2)

- Create the private Storage bucket `plan-import-sources` with **deny-all** Storage policies (no public
  access, mirroring `feedback-screenshots`). Verify no `getPublicUrl` path exists for it.
- Configure the Anthropic secret **only** on the approved environment (server-only; never
  `NEXT_PUBLIC_`). Confirm `npm run verify:client-bundle` passes (key absent from client bundle).
- Review Anthropic's current **published data-processing terms**, storage region, retention, deletion,
  and subprocessors. Record the model name(s) and prices **as of the enablement date** (the code does
  not hardcode an unverified model id — set/confirm the configured model at enablement).
- Record the user-facing **Privacy Policy** language covering uploaded photos/PDFs and third-party AI
  processing before enabling real-user uploads (owner + legal).

## 4. Budget, kill switch, enable/disable, rollback (G1)

- **Enable:** set the monthly cap env (e.g. `IMPORT_MONTHLY_BUDGET_USD`) and the price map, configure
  the provider, then set `PLAN_IMPORT_ENABLED=true`. With the cap/provider unset, the feature refuses
  cleanly (`import_unavailable`) — demonstrate this before enabling.
- **Demonstrate fail-closed states** before launch: `PLAN_IMPORT_ENABLED=false`/unset (refuses uploads
  and model work), provider outage, budget exhausted (reservation blocks new calls), and per-user daily
  quota (6th attempt refused).
- **Disable / outage rollback:** set `PLAN_IMPORT_ENABLED=false`. This stops **new** model work and
  uploads immediately but never deletes already-confirmed plans; in-flight source **cleanup continues**.
  No code rollback is required to stop spend.
- **Cost anomaly response:** if spend approaches the cap or spikes, flip the kill switch off, inspect
  `ImportSpendLedger` (reserved vs actual micro-dollars for the month) and per-account `ImportUsageDay`
  counts, and investigate before re-enabling. Never raise the cap reflexively.

## 5. Upload format caps (validate the Bucket-C defaults before launch, G-caps)

The implemented defaults are **engineering candidates**, not proven provider limits:

| Cap | Default | Validate against |
| --- | ------- | ---------------- |
| Pasted text | 20,000 chars | adopted constant |
| Files per import | 5 | real templates |
| Bytes per file / per import | 10 MiB / 25 MiB | Vercel request + provider limits |
| PDF pages | 20 | provider page limit |
| Image resize | 2000–2400px longest side | provider image limits |
| Parsed output | 14 days / 20 ex-per-day / 15 sets-per-ex | real valid programs |

Confirm each against the actual Vercel plan's function/body limits and Anthropic's documented input
limits at enablement. Record any revised value in `docs/planning/method-note.md` (durable constants)
and surface guessed numbers for owner sign-off. Too-large/unsupported plans must surface a visible
review/error state, never silent truncation.

## 6. Retention & cleanup monitoring (G3 — partially blocked)

**Implemented (reliable):** cleanup on confirm/discard; a **lazy per-request sweep** of the acting
account's own expired unconfirmed sessions; **account-deletion** removes all import rows + stored
objects; **retriable blob-delete tombstones**; an **operator cleanup script**
(`scripts/operator/plan-import-cleanup`, default dry-run, loopback-only) the owner can run on demand.

**🔴 Gap:** a reliable **scheduled** ≤24h purge of sessions that are *abandoned and never reopened*
requires scheduling infrastructure the repo deliberately lacks. Options for the owner (a conscious
architecture decision, NOT made by this run):
1. Add a **Vercel Cron** endpoint invoking the cleanup module hourly (contradicts the current
   "no scheduler/cron" architecture note → requires a planning-doc amendment).
2. An external scheduled trigger (e.g. a platform scheduler) hitting an authenticated cleanup route.
3. Run the operator cleanup script on a host cron.

Until one is chosen, run the operator script regularly and treat the ≤24h scheduled guarantee as
**not met** (report P22-04 retention as partial). Monitor tombstones for failed blob deletes and alert
on growth. Never claim data was purged without evidence (query the tables/bucket).

## 7. Golden-set real-provider evaluation (G5, owner-authorized non-prod spend)

- Use the **synthetic** golden-set fixtures (≥50, no real client data) under the import test fixtures.
- With a limited sandbox/testing budget the owner explicitly authorizes, run the evaluation harness
  against the real provider in a **non-production** environment. Record per-field precision/recall,
  explicit-missing accuracy, ambiguity recognition, **hallucination rate**, catalog accuracy, and
  cost/latency per source kind, separating real-provider results from mocked ones.
- The owner reviews a **quality/hallucination threshold** and signs off before enabling for real users.
  Do not invent a passing accuracy number.

## 8. Browser / mobile-web E2E & Pro/Free checks

- Run Playwright E2E for each source kind through the full journey (upload/paste → extract → review →
  confirm → the created draft in Split & Mesocycle). Where a real provider or file infra can't run in
  CI, mark those paths **unverified**, not passed.
- Verify on a real phone browser (file/photo picker, two-pane → single-column, 44px targets,
  keyboard/reader). **Native iOS/Android is deferred** — do not claim device coverage.
- Confirm Free/anon are denied server-side on `startImport`/`beginExtraction`/`confirmImport`; active
  Pro/trial/comp can import; a lapsed account keeps any already-created plan.

## 9. Required Pitch 23 (Launch Readiness) gates this feature feeds

- Security review item: cross-account isolation of import sessions/sources/drafts + no admin exposure.
- Cost monitoring/alerting on `ImportSpendLedger`; error monitoring for the provider path (no PII).
- Privacy/legal: uploaded-media retention + third-party AI disclosure in the published Privacy Policy.
- The retention-infra decision (G3) resolved and verified.

## 10. Explicitly unverified / not done by the run

- Real-provider extraction accuracy, scanned-PDF/handwriting quality, cost/latency (mocks only).
- On-device mobile behavior (HEIC-on-device, camera-roll picker).
- The ≤24h **scheduled** purge guarantee (infra gap, G3).
- Production migration, bucket creation in prod, provider enablement, spend activation, public release.
- Guidance (tour step + What's New) rendering on real devices (E2E where runnable; else unverified).
