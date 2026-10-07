# Foundation — External Setup Runbook

Everything here is a **human / external** step the autonomous code run could not
(and must not) perform: production credentials, the production Supabase project,
Vercel setup, and the single account creation.

> **No secrets in this file.** Where a value is needed, it says *where to get it*,
> never the value itself. Put real values only into the Supabase/Vercel
> dashboards and your local `.env` (git-ignored).

## Environment model (important)

- **Local development** runs against the **Supabase CLI local stack** (`npx supabase start`) — a Docker-based Postgres + Auth + Studio on your machine. There is **no dev cloud project**.
- **Production** is a single Supabase cloud project named **`overload-prod`**.
- **No staging tier.** **No DB-backed Vercel preview deployments** — Vercel deploys **production only**; you verify changes locally (against the local stack) and in production. (A preview can't reach your local Docker stack, and previews must never share the production database.)

```
Local:   npx supabase start  (Docker: PG 54322, API 54321, Studio 54323)
Prod:    overload-prod  (cloud)  ← Vercel Production only
```

---

## Part A — Local development

### A1. Prerequisites
- Docker Desktop running.
- The Supabase CLI (used via `npx supabase ...`; no global install required).

### A2. Start the local stack
```bash
npx supabase start
```
This boots Postgres, Auth (GoTrue), and Studio using `supabase/config.toml`
(already committed). It prints the **API URL**, **anon key**, and **DB URL**.

### A3. Configure local `.env`
```bash
cp .env.example .env
```
Fill the LOCAL block:
- `DATABASE_URL` / `DIRECT_URL` → `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (both the same locally).
- `NEXT_PUBLIC_SUPABASE_URL` → `http://127.0.0.1:54321`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the anon key printed by `npx supabase start`.
Do **not** prefix `DATABASE_URL`/`DIRECT_URL` with `NEXT_PUBLIC_`.

### A4. Apply the schema locally
```bash
npm install
npx prisma migrate deploy      # applies the migration (incl. deny-all RLS) to the local stack
```

### A5. Create the single local user
`supabase/config.toml` disables signups (mirrors prod). Create the one local
user by hand: **local Studio → http://127.0.0.1:54323 → Authentication → Add user**
(email + password, auto-confirm). This is your local login.

### A6. Run and verify locally
```bash
npm run dev                    # sign in at /login with the local user
npm test                       # unit
npm run test:integration       # throwaway embedded Postgres — never touches the local stack or prod
npm run build && npm run verify:client-bundle
npm run test:e2e               # uses system Chrome
```
> The integration suite uses its own embedded throwaway Postgres. Do **not** set
> `TEST_DATABASE_URL` to the local-stack DB — the guard rejects it (it equals
> `DATABASE_URL`), but don't rely on that; leave it unset.

---

## Part B — Production (`overload-prod`)

### B1. Create / confirm the `overload-prod` Supabase project
In the Supabase dashboard, create (or confirm) the project **`overload-prod`**.
Note its project ref. This is the only cloud project.

### B2. Disable public signups
`overload-prod` → **Authentication → Sign In / Providers** (or **Settings → Auth**):
- Turn **off** "Allow new users to sign up".
- Confirm the **Email** provider is **enabled** with **email + password**.

### B3. Create / configure the Vercel project
1. Import the GitHub repo into Vercel (framework auto-detected as Next.js).
2. Build command `next build` (default). `prisma generate` runs via `postinstall`.
3. The build does **not** apply migrations — keep it that way.
4. **Do not configure DB-backed preview environments.** Leave Preview/Development
   without Supabase DB env vars (production-only deploy model). If Vercel builds
   previews, they are not expected to be DB-functional.

### B4. Configure Vercel PRODUCTION environment variables (→ overload-prod)
Vercel → Project → **Settings → Environment Variables**, scope = **Production**:

| Variable | Value source | Notes |
| -------- | ------------ | ----- |
| `DATABASE_URL` | overload-prod pooled (Database settings, port 6543, `?pgbouncer=true`) | server-only; not `NEXT_PUBLIC_` |
| `DIRECT_URL` | overload-prod direct (port 5432) | server-only |
| `NEXT_PUBLIC_SUPABASE_URL` | overload-prod Project URL (API settings) | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | overload-prod anon key (API settings) | public |

The service-role key is not used by Foundation; do not add it.

### B5. Apply the reviewed migration to production (manual, after approval)
With the overload-prod **direct** connection, from a trusted machine, for this one command only:
```bash
DIRECT_URL="<overload-prod direct connection>" npx prisma migrate deploy
```
- Creates all 11 tables **and** enables deny-all RLS (including on `_prisma_migrations`).
- Do **not** run `prisma migrate reset`, `prisma db push`, or any destructive command against production.
- Do not commit the prod `DIRECT_URL` anywhere.

### B6. Create the single production user
`overload-prod` → **Authentication → Users → Add user** → one email + password,
auto-confirm. This is the only account. Do not enable signups to create it.

### B7. Verify production RLS posture
```sql
-- Expect ZERO rows: every public table must have RLS enabled.
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- Expect ZERO rows: no policies may grant access.
SELECT * FROM pg_policies WHERE schemaname = 'public';
```
Confirm with the prod **anon** key that the Data API returns nothing:
```bash
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/exercises?select=*" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# Expect: [] or a permission error — never application rows.
```

### B8. First production login & smoke checks
1. Deploy to production (merge/promote once PR #1 is approved).
2. Visit the production URL unauthenticated → **redirected to `/login`** (never app content).
3. Confirm there is **no** `/register` or `/signup` surface.
4. Sign in with the production user → you reach the authenticated shell (Today).
5. Sign out → back to `/login`.

## Rollback / recovery

- **Bad deployment:** Vercel → Deployments → **promote the previous good deployment** (instant rollback). Foundation is schema-only with no app writes, so no data is at risk.
- **Migration concern:** Foundation's migration only **creates** tables and enables RLS; it drops nothing. If partially applied, inspect `_prisma_migrations` on prod and re-run `prisma migrate deploy` (idempotent for applied migrations). Do **not** `migrate reset` production.
- **Locked out / wrong password:** reset the single user's password in the `overload-prod` dashboard. Do not enable signups.
- **RLS accidentally disabled on a table:** re-enable immediately — `ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;` — and confirm no policies exist. A table without RLS is publicly readable via the anon key.
- **Local stack reset:** `npx supabase db reset` rebuilds the local DB from migrations (local only — never run against prod).

## What this run already did (so you don't repeat it)

- Created the Prisma schema + initial migration with deny-all RLS (verified against a throwaway Postgres).
- Added `supabase/config.toml` so `npx supabase start` works out of the box (signups off, to mirror prod).
- Wired auth (email/password), the protected shell, and the test/verification suites.
- Touched **no** Supabase project (local or cloud) and used **no** production credentials.

## Downstream

Once Part A verifies locally and Part B is complete and green, the repository is
ready for **Pitch 2: Library & Gyms Setup**.
