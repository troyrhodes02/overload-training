# Foundation — External Setup Runbook

Everything in this runbook is a **human / external** step the autonomous code run
could not (and must not) perform: production credentials, production Supabase and
Vercel changes, and the single account creation. Do these **after reviewing the
Foundation feature PR** and before relying on production.

> **No secrets in this file.** Where a value is needed, it says *where to get it*,
> never the value itself. Put real values only into Supabase/Vercel dashboards and
> local `.env` files (which are git-ignored).

## 0. Prerequisites & order

Do these in order. Development setup (§1–§5) is enough to run and verify locally
and on Vercel previews. Production setup (§6–§12) happens only when you're ready
to ship and have reviewed the migration.

```
dev Supabase ──▶ local .env ──▶ local verify ──▶ Vercel project ──▶ preview envs
                                                                       │
prod Supabase ──▶ prod envs ──▶ apply migration ──▶ create user ──▶ prod verify
```

---

## 1. Create / confirm the Supabase DEVELOPMENT project

1. In the Supabase dashboard, create a project named e.g. `overload-dev` (or confirm the existing one).
2. Note the project ref (the `xxxx` in `xxxx.supabase.co`).
3. This project backs local development **and** Vercel preview deployments. It is **never** production.

## 2. Create / confirm the Supabase PRODUCTION project

1. Create a **separate** project named e.g. `overload-prod`.
2. It is used only by the Vercel production environment. There is no staging tier.
3. Keep its credentials out of local development and previews.

## 3. Disable public signups (both projects)

1. Supabase dashboard → **Authentication → Sign In / Providers** (or **Settings → Auth**).
2. Turn **off** "Allow new users to sign up" (disable public signups) for **both** dev and prod.
3. Confirm **Email** provider is **enabled** with **email + password** (not magic link / OTP only).
4. Rationale: there is exactly one account and the app ships no registration surface. Signups stay off at the platform level too.

## 4. Obtain the development connection strings

From the dev project → **Project Settings → Database**:

- **Pooled** connection (Transaction pooler, port **6543**) → this is `DATABASE_URL`. Append `?pgbouncer=true` as Supabase shows.
- **Direct** connection (port **5432**) → this is `DIRECT_URL`.

From the dev project → **Project Settings → API**:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`.
- **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe to expose; deny-all RLS makes it powerless).
- The **service_role** key is **not used by Foundation**. Do not add it anywhere.

## 5. Configure local development & verify

1. `cp .env.example .env` and fill in the four dev values from §4. Do **not** prefix `DATABASE_URL`/`DIRECT_URL` with `NEXT_PUBLIC_`.
2. Apply the schema to the **dev** database:
   ```bash
   npm install
   npx prisma migrate deploy      # uses DIRECT_URL from prisma.config.ts
   ```
3. In the Supabase dev dashboard → **Authentication → Users → Add user**, create one user (email + password, "Auto Confirm"). This is the dev login.
4. Run the app and the suites:
   ```bash
   npm run dev                    # sign in at /login with the dev user
   npm test                       # unit
   npm run test:integration       # throwaway Postgres (never touches Supabase)
   npm run build && npm run verify:client-bundle
   npm run test:e2e               # uses system Chrome
   ```

## 6. Create / configure the Vercel project

1. Import the GitHub repo `troyrhodes02/overload-training` into Vercel (framework auto-detected as Next.js).
2. Build command `next build` (default). Install runs `prisma generate` via `postinstall` automatically.
3. The build does **not** run migrations — keep it that way.

## 7. Configure Vercel PREVIEW environment variables (→ dev Supabase)

In Vercel → Project → **Settings → Environment Variables**, scope = **Preview** (and Development):

| Variable | Value source | Notes |
| -------- | ------------ | ----- |
| `DATABASE_URL` | dev pooled (§4) | server-only; not `NEXT_PUBLIC_` |
| `DIRECT_URL` | dev direct (§4) | server-only |
| `NEXT_PUBLIC_SUPABASE_URL` | dev project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dev anon key | public |

Previews must point at the **dev** Supabase project, never production.

## 8. Configure Vercel PRODUCTION environment variables (→ prod Supabase)

Same four variables, scope = **Production**, using the **prod** project's values from its own Database/API settings. Never reuse dev values here.

## 9. Apply the reviewed migration to PRODUCTION (manual, after approval)

Only after the Foundation PR is reviewed and you have the **prod** `DIRECT_URL`:

```bash
# From a trusted machine, with the prod DIRECT_URL exported for this one command only:
DIRECT_URL="<prod direct connection>" npx prisma migrate deploy
```

- This creates all 11 tables **and** enables deny-all RLS (the migration includes the `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements, including on `_prisma_migrations`).
- Do **not** run `prisma migrate reset`, `prisma db push`, or any destructive command against production.
- Do not commit the prod `DIRECT_URL` anywhere.

## 10. Create the single PRODUCTION user (manual)

Supabase **prod** dashboard → **Authentication → Users → Add user** → one email + password, Auto Confirm. This is the only account. Do not enable signups to create it.

## 11. Verify production RLS posture

Against the prod database (read-only check), confirm RLS is enabled with no policies:

```sql
-- Expect ZERO rows: every public table must have RLS enabled.
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- Expect ZERO rows: there must be no policies granting access.
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

Also confirm with the prod **anon** key that the Data API returns nothing, e.g.:

```bash
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/exercises?select=*" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# Expect: [] (or a permission error) — never application rows.
```

## 12. First production login & smoke checks

1. Deploy to production (merge/promote once the PR is approved).
2. Visit the production URL unauthenticated → you must be **redirected to `/login`** (never see app content).
3. Confirm there is **no** `/register` or `/signup` surface.
4. Sign in with the production user → you reach the authenticated shell (Today).
5. Sign out → back to `/login`.

## Rollback / recovery

- **Bad deployment:** in Vercel → Deployments, **promote the previous good deployment** (instant rollback). No data change is involved for Foundation (schema-only, no app writes yet).
- **Migration concern:** Foundation's migration only **creates** tables and enables RLS; it drops nothing. If it partially applied, inspect `_prisma_migrations` on prod and re-run `prisma migrate deploy` (idempotent for applied migrations). Do **not** `migrate reset` production.
- **Locked out / wrong password:** reset the single user's password in the Supabase dashboard. Do not enable signups.
- **RLS accidentally disabled on a table:** re-enable immediately — `ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;` — and confirm no policies exist. A table without RLS is publicly readable via the anon key.

## What this run already did (so you don't repeat it)

- Created the Prisma schema + initial migration with deny-all RLS (verified against a throwaway Postgres).
- Wired auth (email/password), the protected shell, and the test/verification suites.
- Did **not** touch any Supabase project, production or dev, and used no production credentials.

## Downstream

Once §1–§12 are complete and green, the repository is ready for **Pitch 2: Library & Gyms Setup** to build on this authenticated, RLS-secured, Prisma-backed substrate.
