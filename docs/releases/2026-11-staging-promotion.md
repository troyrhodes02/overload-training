# Release 2026-11 — `staging` → `main` promotion

**Prepared:** 2026-11-10. **Release branch:** `release/staging-promotion-2026-11`, cut from `origin/staging`. **Target:** `main` (Production). **Status: BLOCKED — DO NOT MERGE** until gate R1 below is done and verified.

Nothing here has been run against Production. Every step marked *owner* is a human step.

## 1. What is in the release

`main` (`63e95d9`) is a strict ancestor of `staging`, so the release branch is `staging`'s tip with no cherry-picks. The accidental Pitch 22 merge (#130) and its revert (#138) are already on `main`. `staging` brings Pitch 22 back through #139, so merging re-applies the reverted code. That is intended.

| PR | What |
| -- | ---- |
| `4eb5559` (direct) | Docs: the permanent `staging` branch |
| #140 | Dev-only staging test-account tool (refuses Production, no override) |
| #139 | Pitch 22 Workout Plan Import & Review (feature, migrations `9l`, `9m`) |
| #141 | Import upload/error messages (PDF on Vercel, session-expired copy) |
| #142 | Start no longer creates a second empty session |
| #143 | Desktop two-panel review, Create plan opens the saved plan, named weekdays, Discard safety |
| #144 | PDF/long-plan extraction: truncation vs bad output, timeout, retry, spend honesty |
| #145 | Drag-and-drop upload zone |
| #146 | Compact extraction format (long plans), first-of-alternates, format guide, usage meter |
| #147 | Search the whole library for a match, Change a match, Import card moved on Plan |
| release-prep PR | Default model = tested model; Plan Import release note held; these docs |

All of these PRs are merged into `staging`. None are open against it.

**Merge strategy: "Create a merge commit".** It keeps `staging`'s commits in `main`'s history, so `main` stays an ancestor of `staging` and the post-release sync is a fast-forward. Do **not** squash: a squash commit has no shared ancestry with `staging`, and the next promotion would replay every Pitch 22 commit and conflict.

## 2. Database

Two migrations exist on the release branch that are not in `main`:

| Migration | What it does | Safety |
| --------- | ------------ | ------ |
| `9l_plan_import` | Creates enums `ImportStatus`, `import_source_kind`. Creates tables `import_sessions`, `import_source_parts`, `import_usage_days`, and `import_spend_ledger`, with CHECKs, indexes, and FKs to `profiles` and `mesocycles` (RESTRICT). Enables RLS on all four, with no policies. Adds the `overload_user_id_immutable` and `overload_assert_same_owner` triggers. | Additive only. It drops, renames, and rewrites nothing. It depends on the trigger functions and the `profiles`/`mesocycles` tables from earlier migrations. |
| `9m_plan_import_retention` | Adds the nullable `import_sessions.sources_purged_at` column and a partial index. | Additive. |

**Hard dependency.** These must be applied to Production **before** the code deploys, even with import switched off:
- Account deletion reads and deletes the import tables unconditionally (`src/lib/accounts/deletion.ts`).
- Data export includes them (`src/lib/accounts/export.ts`).
- `/plan/import` runs a retention sweep before its kill-switch check.

Without the tables, account deletion and data export fail for every account. The migrations are safe to apply while the current Production code is running, because old code ignores new tables. So apply them first, then deploy.

Not run by the build. `build` is `next build` and `postinstall` is `prisma generate`. Nothing in the Vercel build runs a migration.

**Not verified:** Production's migration history. Production credentials are not available to engineering, by design, so `_prisma_migrations` was not read. The owner checks it in step R1.

## 3. Plan Import (AI) in Production

- **Model.** Every real staging extraction ran on `claude-sonnet-5-5`, as recorded on the `overload-dev` sessions. The code default used to be `claude-opus-4-8`, which is untested here and costs $5 / $25 per MTok against Sonnet 5.5's $2 / $10. The release-prep PR changes the default to `claude-sonnet-5-5`. Set `PLAN_IMPORT_MODEL=claude-sonnet-5-5` in Production anyway, so the choice is explicit.
- **Request shape.** Structured output in a compact format, `effort: "low"`, a 20,000 max-output-token cap (under the SDK's non-streaming ceiling), a 240 s abort, and `maxDuration = 300` on the import route. That 300 s limit already deploys on this Vercel project.
- **Spend cap.** `PLAN_IMPORT_MONTHLY_SPEND_MICROS` is a reservation counter, not a bill:
  - Every started attempt reserves $0.50 (`ESTIMATED_ATTEMPT_MICROS`).
  - On success, and on failures where the provider may have billed, the full $0.50 is kept as "actual". Real token pricing is deferred (RD-17).
  - Failures with no answer release it.
  - So the cap limits **attempts**: $50 is 100 attempts a month.
  - Real cost per import on staging was about $0.05–$0.10 (text run: 2,672 in / 4,222 out ≈ $0.05). That is an estimate from token counts at list price, not an Anthropic invoice.
  - The cap is global, and an unset cap fails closed.
- **Quotas and retries.**
  - Each account gets 5 started attempts per account-local day, and a retry counts as one.
  - Each import allows at most 2 billable attempts.
  - A lease and compare-and-set stop concurrent extraction of one import.
  - 429, 5xx and timeouts are retryable; malformed or truncated output is terminal.
- **Quality gate (G5) not met.** Staging evidence is a handful of real runs, all `claude-sonnet-5-5`: 2 text and about 5 PDF attempts, one of which succeeded after #146 (6 days, about 42 exercises). The runbook's gate is a budgeted real-provider run of the 55 synthetic golden fixtures, with precision/recall, hallucination rate and cost per source kind, and an owner-signed threshold. That has not been run.
- **Consent and terms (G2) not met.**
  - The app has no privacy policy page, and nothing tells lifters that uploads go to Anthropic.
  - Anthropic's commercial terms, data retention (standard API retention, ZDR not in use), and subprocessors need owner/legal review.
  - Model Covered status needs owner review too, and the disclosure has to be published before enabling.

## 4. Storage and retention

- **Bucket.** The private bucket `plan-import-sources` is a code constant. The app never creates buckets, so it must be created by hand in Production: private, with no policies (deny-all, mirroring `feedback-screenshots`). It is not needed while import is off.
- **Retention (G3) not met.** The 24-hour limit holds only on these paths:
  - confirm and discard;
  - a lazy per-account sweep;
  - account deletion;
  - retry tombstones;
  - the operator script, `npm run plan-import:cleanup` (`--production --confirm-ref ycxvdiklpefyhdclxyau`).

  Nothing purges a session that is abandoned and never reopened, because there is **no scheduler**. That is a deliberate architecture non-goal.

  A scheduler is an owner decision, not something to slip into a release:
  - It contradicts `docs/planning/architecture.md` and CLAUDE.md ("no scheduler or cron job").
  - A cross-account purge running in app code would need a new entry in the raw-Prisma allow-list, which is the account-isolation invariant.

  Recommended design, after the owner amends the architecture doc:
  1. Add an authenticated route, `POST /api/cron/plan-import-retention`, that requires `Authorization: Bearer $CRON_SECRET` and calls the cleanup module's `planCleanup` and `executeCleanup`, bounded per run.
  2. Trigger it hourly. Vercel Cron works on Pro (Hobby allows only once a day, and an hourly expression fails the deploy). A scheduled GitHub Actions workflow works on any plan.

  The gate blocks **enabling** import, not a flag-off deploy: with the kill switch off, no source can be uploaded.

## 5. Flag-off behavior in Production (what users would see)

- **Pro and trial accounts.** `/plan` shows a quiet "Plan import is temporarily unavailable" note. That is the spec'd kill-switch state, and every trial account sees it.
- **Free accounts.** They see "Importing a written plan is part of Pro. See Pro", an upsell for a feature that is off. That is also the spec'd behavior. If it's unwanted before enablement, hide the entry while the switch is off, which needs a design-doc change.
- **Server.** Every import server action refuses before any work, because `guardImport` checks capability and then the kill switch. No upload, no provider call, no spend.
- **Tour and What's New.**
  - The tour's "Import an existing plan" step is skipped, because its target doesn't render.
  - The What's New entry is **held** in this release: removed from the catalog, with its text kept in a comment. Re-add it dated the day import is enabled.

## 6. Owner deployment checklist (in order)

| # | Service | Where | Action | Env | When | Verify | Prod approval |
| - | ------- | ----- | ------ | --- | ---- | ------ | ------------- |
| R1a | Supabase | `overload-prod` → Database → Backups | Take an on-demand backup (or confirm PITR), then restore it into a scratch project and check that it opens. | Production | Before merge | Backup listed, restore opens | **Yes** |
| R1b | Local shell | A clean shell. `prisma.config.ts` loads `.env` but never overrides a variable already set, so pass Production's session-pooler URL inline and check that its user is `postgres.ycxvdiklpefyhdclxyau`. The host is shared with dev, so the host alone proves nothing. | `DIRECT_URL='<prod session pooler, port 5432>' npx prisma migrate status` | Production | Before merge | Lists exactly `9l_plan_import` and `9m_plan_import_retention` as not applied, and nothing else | **Yes** (read-only) |
| R1c | Local shell | Same shell, same inline URL | `DIRECT_URL='<same>' npx prisma migrate deploy` | Production | Before merge | Exits 0. `migrate status` says up to date. | **Yes** |
| R1d | Supabase | SQL editor, `overload-prod` | `select relname, relrowsecurity from pg_class where relname like 'import_%';` and `select tgname from pg_trigger where tgname like 'import_%';` | Production | Before merge | 4 tables with RLS true, 5 triggers. Table Editor shows no policies. | Read-only |
| R2 | Vercel | Project → Settings → Environment Variables, filter Production | Confirm `PLAN_IMPORT_ENABLED`, `ANTHROPIC_API_KEY`, and `PLAN_IMPORT_MONTHLY_SPEND_MICROS` are **absent** in Production. Set `PLAN_IMPORT_MODEL=claude-sonnet-5-5` (Production). Confirm that existing `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` name `ycxvdiklpefyhdclxyau`, and that Turnstile, invite, and Stripe values are the Production ones, not the Preview test keys. | Production | Before merge | Values reviewed | **Yes** |
| R3 | GitHub | PR `release/staging-promotion-2026-11` → `main` | Remove the BLOCKED marker after R1. Merge with **Create a merge commit**. | — | After R1, R2 | Vercel Production deployment succeeds | **Yes** |
| R4 | Browser | Production site | Smoke test: log in, `/plan` shows the import "unavailable" note (Pro/trial), `/plan/import` shows the unavailable card, data export downloads, the library loads. | Production | After deploy | All pass | — |
| R5 | GitHub | Local shell | Sync `staging` (section 7). | — | After R4 | `staging` = `main` plus nothing | — |

**Enabling Plan Import later (separate approval, not this release):**
1. Resolve G3 (scheduler: architecture amendment and implementation) and G2 (privacy page, Anthropic terms).
2. Run G5 (authorized real-provider golden-set eval on staging) and sign off a threshold.
3. Create the Production bucket `plan-import-sources` (Supabase → Storage → New bucket, **Public off**, no policies).
4. Create a dedicated Production key in the Anthropic Console (Settings → API keys, in a Production workspace with a monthly spend limit), and set `ANTHROPIC_API_KEY` in Vercel Production.
5. Set `PLAN_IMPORT_MONTHLY_SPEND_MICROS`. For example, `50000000` is $50, which is 100 attempts.
6. Re-add the release note, then set `PLAN_IMPORT_ENABLED=true` in Vercel Production and redeploy.

Roll back by setting `PLAN_IMPORT_ENABLED` to `false` and redeploying.

## 7. Keeping `staging` alive after the release

After R4 passes:

```sh
git fetch origin
git switch staging && git pull --ff-only origin staging
git merge --ff-only origin/main   # main = staging + one merge commit, so this fast-forwards
git push origin staging           # normal push, never --force
```

- **If `--ff-only` refuses** (someone pushed to `staging` meanwhile), run `git merge origin/main` (a normal merge commit), test, and push.
- **Environment.** Leave Vercel's Preview-scoped and `staging`-branch-scoped variables as they are. They point at `overload-dev` (`vdxrmfadikwzodjljbdi`), and the deployment-guard tripwire keeps Preview off Production.
- **URL.** The staging URL stays `overload-training-git-staging-…vercel.app`, because it follows the branch. Don't delete or recreate the branch.
- **New work.** New feature PRs keep targeting `staging`. Open the next promotion the same way: a `release/*` branch from `staging`, owner-approved, merged with a merge commit.
