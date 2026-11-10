# Environment isolation: local, Preview, Production

**Status:** current (OVE-111, 2026-11-09). This page supersedes earlier wording that said there is no development cloud project and no DB-backed Preview deployments. That wording appears in older runbooks, specs, and the root `CLAUDE.md` history.

It describes where each environment points, the rules that keep Preview and operator tooling away from Production, and the one safe procedure for initializing the development project.

## The three environments

| Environment | Runs where | Database and Supabase project | Data it may hold |
| --- | --- | --- | --- |
| **Local** | `next dev`, tests, operator dry runs | Supabase CLI stack (`npx supabase start`): `127.0.0.1:54321` (API) and `:54322` (Postgres). Integration tests use a throwaway embedded Postgres. | Synthetic only |
| **Preview** | Vercel Preview deployments (every PR branch) | The **development** project `overload-dev`, ref **`vdxrmfadikwzodjljbdi`** | Synthetic only: test accounts and the demo fixture |
| **Production** | Vercel Production | `overload-prod`, ref **`ycxvdiklpefyhdclxyau`** | Real lifters' data. The only copy. |

There is no separate staging database or tier. `overload-dev` serves every Preview, including the permanent `staging` branch (`docs/technical/staging-environment.md`), and is a sandbox, not a staging copy of Production. Nothing is promoted from it, and no Production data is ever copied into it.

## Rules

1. **Only Vercel Production points at Production.**
   - Every database and Supabase variable in Vercel's **Preview** and **Development** scopes names the development project.
   - A tripwire enforces this in code (`src/lib/env/deployment-guard.ts`). When `VERCEL_ENV` is `preview` or `development`, any of these variables naming the Production ref fails the **build** (`next.config.ts`), refuses **server start** (`src/instrumentation.ts`), and refuses to build the Prisma client (`src/lib/db.ts`): `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`.
   - The error names the variable, never its value. Production and local `next dev` are unaffected.
2. **A project is identified by its ref, never by its hostname.** Through Supabase's shared pooler, Production and the development project have the *same* host (`aws-0-<region>.pooler.supabase.com`). The ref comes from:
   - the pooler **username**: `postgres.<ref>`;
   - the **direct host**: `db.<ref>.supabase.co`;
   - the **API URL**: `https://<ref>.supabase.co`.

   A pooler URL without a ref in its username, a username that disagrees with its host, and an unrecognized host are all *unknown*, and unknown is refused (`src/lib/env/supabase-identity.ts`).
3. **Every operator connection goes through the target-identity guard** (`scripts/operator/target-identity.ts`), before any connection opens:
   - Every set `DATABASE_URL`, `DIRECT_URL` and `NEXT_PUBLIC_SUPABASE_URL` must agree: all local, or all the same hosted project.
   - A hosted target must be cross-checked by a database URL **and** `NEXT_PUBLIC_SUPABASE_URL`.
   - A hosted target needs `--confirm-ref <its ref>`. `--confirm-host` and `OVERLOAD_IMPORT_CONFIRM_HOST` are retired and refused.
   - Any mention of the Production ref is refused, unless a tool's runbook sanctions an explicit production opt-in (table below).
   - A unit test (`tests/unit/operator-target-guards.test.ts`) fails if a script that opens a connection skips the guard or the marker check.
4. **The development database proves its own identity.** A hosted, non-production target must carry the identity marker, a comment on an empty schema, read back with a read-only query before anything is written:

   ```sql
   CREATE SCHEMA IF NOT EXISTS overload_target;
   COMMENT ON SCHEMA overload_target IS 'overload-target:<dev ref>';
   ```

   The schema holds no table, so it adds no row-level-security surface, and it isn't in the Data API's exposed schemas. Production never carries the marker.
5. **Export, don't rely on `.env`.** Operator tools compare *every* set target variable. Export `DATABASE_URL`, `DIRECT_URL` and `NEXT_PUBLIC_SUPABASE_URL` for the same project in the shell. Exported values win over `.env` (dotenv never overrides), and a leftover local value from `.env` beside a hosted export is refused as a mixed environment. Keep hosted values in a git-ignored file you load deliberately, never in `.env` or `.env.local`.

### Operator tools and their production policy

| Tool | Command | Local | Development project | Production |
| --- | --- | --- | --- | --- |
| Dev migration wrapper | `npx tsx scripts/operator/migrate-dev/cli.ts` | allowed | `--confirm-ref <ref>` + marker; `--execute` to apply | **refused, no override.** Production migrations stay a human runbook step with a fresh backup. |
| Demo seed | `npm run demo:seed` | allowed (default) | `--confirm-ref <ref>` + marker | **refused, no override** |
| Exercise-library seed | `npm run db:seed` (local) / `npx tsx prisma/seed.ts` (hosted) | allowed | `--confirm-ref <ref>` (or `OVERLOAD_IMPORT_CONFIRM_REF`) + marker | only with `--production` **and** `--confirm-ref <prod ref>`. There is no environment-variable form of the opt-in; `OVERLOAD_IMPORT_PRODUCTION` is refused. |
| Real-plan import | `npm run import:plan` | allowed | `--confirm-ref <ref>` + marker | only with `--production` **and** `--confirm-ref <prod ref>` |
| Founding-member grant | `npm run founding-members:grant` | allowed | `--confirm-ref <ref>` + marker | only with `--production` **and** `--confirm-ref <prod ref>` |
| Ownership backfill | `npm run ownership:backfill` | allowed | `--confirm-ref <ref>` + marker | only with `--production` **and** `--confirm-ref <prod ref>` |

The production opt-in exists only where an approved runbook already sanctions a deliberate, human production run. It is stricter than the host confirmation it replaces. Every production step still requires a fresh backup immediately before. In PowerShell, npm drops options after `--`, so run the CLIs with `npx tsx …` directly.

**Pending:** the plan-import cleanup CLI (`scripts/operator/plan-import-cleanup`) exists only on the Pitch 22 branch (PR #130). When #130 merges, it must call `assertOperatorTarget` with `production: "refuse"` and `verifyTargetMarker` before connecting. The structural test above will fail until it does.

## Initializing `overload-dev` (safe procedure)

Nothing here touches Production. Steps marked **(human)** happen in the Supabase or Vercel dashboards. Steps marked **(tool)** run from a shell with the development project's values exported.

1. **(human) Create the project.** Name it `overload-dev`. Use the same region as Production and the same Postgres major version (check Production's in its dashboard; the local config pins 17). Its ref is **`vdxrmfadikwzodjljbdi`**, used in every command below.
2. **(human) Auth settings** (Authentication → Sign In / Providers):
   - Email provider **on**.
   - "Allow new users to sign up" **off** (the app creates accounts through the admin API).
   - "Confirm email" **off**.
   - "Secure password change" **on**.
   - No social providers.
3. **(human) URL configuration:**
   - **Site URL:** a stable Preview origin (the branch URL you test on).
   - **Redirect URLs:** `https://*-<vercel-team-slug>.vercel.app/**`.
4. **(human) Email templates.** Copy Production's template *text* (configuration, not user data). They link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` and `…&type=magiclink`. For SMTP, the built-in sender is enough for low-volume development (team members only), or use a separate Resend API key.
5. **(human) Storage.** Create the private buckets `plan-import-sources` and `feedback-screenshots` with **no policies**. The library seed creates the public `exercise-images` bucket itself.
6. **(human) Identity marker.** In the development project's SQL editor, run the two statements under rule 4 with `vdxrmfadikwzodjljbdi`.
7. **(human) Credentials.** Collect the transaction-pooler URL (port 6543), the Session-pooler URL (port 5432; the direct host is IPv6-only), the project URL, and the anon and service-role keys. Store them in a password manager and in a git-ignored file outside `.env`.
8. **(tool) Export the dev values:**
   - `DATABASE_URL` = transaction pooler, `postgres.vdxrmfadikwzodjljbdi`, port 6543
   - `DIRECT_URL` = Session pooler, `postgres.vdxrmfadikwzodjljbdi`, port 5432
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://vdxrmfadikwzodjljbdi.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = the dev key

   Never print them.
9. **(tool) Dry run:** `npx tsx scripts/operator/migrate-dev/cli.ts --confirm-ref vdxrmfadikwzodjljbdi`. It prints the confirmed target, verifies the marker, and runs the read-only `prisma migrate status`. Expect every migration pending on the empty database.
10. **(tool) Apply:** `npx tsx scripts/operator/migrate-dev/cli.ts --confirm-ref vdxrmfadikwzodjljbdi --execute` (runs `prisma migrate deploy`).
11. **(tool) Read-only checks** in the dev SQL editor:
    - Every `public` table has RLS enabled.
    - `SELECT count(*) FROM pg_policies WHERE schemaname = 'public'` is 0.
    - The same-owner and `user_id`-immutability triggers exist.
    - `_prisma_migrations` lists every migration.
    - With the dev anon key, `GET https://vdxrmfadikwzodjljbdi.supabase.co/rest/v1/<table>` returns nothing for each table.
12. **(tool) Exercise library:** `npx tsx prisma/seed.ts --confirm-ref vdxrmfadikwzodjljbdi` (all four variables from step 8 exported).
13. **(human) Vercel → Settings → Environment Variables.**
    - Scope every database and Supabase variable to the dev project for **Preview**.
    - Leave Production untouched.
    - Put no database variables in **Development**.
    - Leave billing and plan import unset on Preview.
    - Then delete or redeploy every Preview built before the change: old Previews keep the values they were built with.
14. **(human) Test accounts** through a Preview's signup form, using dev-only invite settings and synthetic identities. Put the dev admin's id in Preview's `OVERLOAD_ADMIN_USER_IDS`.
15. **(tool, optional) Demo history** into an empty dev account: `npm run demo:seed -- --user-id <uuid> --confirm-ref vdxrmfadikwzodjljbdi`, then add `--execute --confirm-user <uuid>`.

### Proving Preview cannot reach Production

- [ ] No Preview-scoped variable contains `ycxvdiklpefyhdclxyau`. A Preview build with one fails at `next.config.ts`.
- [ ] On a fresh Preview, the browser's auth calls go to `https://vdxrmfadikwzodjljbdi.supabase.co`.
- [ ] A Preview signup appears in the dev project's Auth users and not in Production's.
- [ ] A set logged on a Preview appears in the dev `logged_sets` table only.
- [ ] No Preview built before the variable change still exists.
