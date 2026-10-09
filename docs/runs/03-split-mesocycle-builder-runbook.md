# Split & Mesocycle Builder — External Setup Runbook

Everything here is a **human / external** step the autonomous run could not, and must not, perform. That means applying the migrations to `overload-prod`, checking the production deploy, smoke-testing with real data on your phone, and cleaning up local verification data.

> **No secrets in this file.** Where a value is needed, it says *where to get it*, never the value itself.

## Read this first

- **The environment model is unchanged.** Local development uses the Supabase CLI stack; the only cloud project is **`overload-prod`**; Vercel deploys **production only**.
- **Your local `.env` points at the local stack.** This was checked on 2026-10-08 by host only (`127.0.0.1:54322` / `:54321`). For the production steps in Part B, pass production values **on the command line for that one command**; never edit them into `.env`.
- **Deploy order matters.** The new code needs migrations `2_mesocycle_draft_status` and `3_split_mesocycle_builder`: the `draft` status, the `SplitType` enum, and `start_date` as a `DATE`.
  - The Pitch 2 code now in production never reads plan tables, so **it is safe to apply these migrations before the merge deploys**.
  - If the merge deploys first, `/plan` shows the error page until B1 is applied. No data is at risk: reads fail and writes are rejected.
  - `/`, `/exercises`, and `/gyms` keep working either way.
- **The migrations are additive and in place.** Migration 2 adds an enum value. Migration 3:
  - converts `split_type` to an enum and `start_date` to a `date` in place;
  - sets the `draft` default;
  - adds CHECK constraints, a single-active partial unique index, and two unique indexes.
  - Nothing is dropped, renamed, inserted, or deleted. RLS stays deny-all with zero policies.
- Nothing in this pitch uses the Supabase **service-role** key.

---

## Part A — Local development (Supabase CLI stack)

### A1. Apply the migrations locally — **already done by the run**
The run applied `2_mesocycle_draft_status` and `3_split_mesocycle_builder` to your local stack (`npx prisma migrate deploy` against `127.0.0.1:54322`). On another machine:
```bash
npx supabase start
npx prisma migrate deploy      # applies 2_ and 3_ after 0_init and 1_library_gyms_setup
```

### A2. Remove the run's local verification data (optional, local only)
The run verified authenticated screens against your **local** stack. To do that it created:
- a local-only account `pitch3-verify@overload.local`, through the local admin API;
- `[verify] …` mesocycles and two `[verify] …` custom exercises, which are now archived.

To remove them from the local stack:
```bash
# 1. Delete the local verification account (Supabase Studio → Authentication → Users,
#    http://127.0.0.1:54323), or:
docker exec supabase_db_overload psql -U postgres -c \
  "delete from auth.users where email = 'pitch3-verify@overload.local';"

# 2. Delete the [verify] plan rows (plan rows only; sessions and slots cascade):
docker exec supabase_db_overload psql -U postgres -c \
  "delete from public.mesocycles where name like '[verify]%';"
```
The `[verify]` custom exercises can't be hard-deleted while any plan references them (FK `Restrict`). After step 2 they are unreferenced, and they are already archived; leaving them is harmless. **Never run these against production.**

### A3. Run the app locally
```bash
npm run dev                    # http://localhost:3000 — sign in with your local account
```

---

## Part B — Production (`overload-prod`)

### B1. Apply the migrations to production — **do this first**
1. Check that production has no mesocycles. Nothing could create one before this pitch, so the in-place casts operate on zero rows. If it does have some, every `split_type` must be one of `ppl`, `arnold`, `bro`, `custom`, or migration 3 fails loudly. Failing is safe: it runs in one transaction and changes nothing.
   ```sql
   -- Supabase Dashboard → overload-prod → SQL Editor
   select count(*) as mesocycles, array_agg(distinct split_type) as split_types from public.mesocycles;
   ```
2. Apply. Use the **direct** connection string (Dashboard → Project Settings → Database → Connection string → *Direct connection*), passed on the command line only:
   ```bash
   DIRECT_URL="<overload-prod direct connection string>" \
   DATABASE_URL="<overload-prod direct connection string>" \
   npx prisma migrate deploy
   ```
   Expected: `Applying migration 2_mesocycle_draft_status` and `Applying migration 3_split_mesocycle_builder`, then `All migrations have been successfully applied.`
3. If migration 3 fails:
   - nothing from it was applied, because it runs in a single transaction;
   - fix the cause (most likely an unexpected `split_type` value), then run `npx prisma migrate resolve --rolled-back 3_split_mesocycle_builder` with the same env and re-run `migrate deploy`;
   - **do not** use `prisma migrate reset` or `db push`.

### B2. Verify the database
```sql
-- New lifecycle state and split type
select enum_range(null::"MesocycleStatus");      -- {draft,active,archived}
select enum_range(null::"SplitType");            -- {ppl,arnold,bro,custom}
select data_type from information_schema.columns
 where table_name = 'mesocycles' and column_name = 'start_date';   -- date

-- Plan-shape guarantees
select indexname from pg_indexes
 where indexname in ('mesocycles_single_active',
                     'sessions_mesocycle_id_day_of_week_key',
                     'session_exercises_session_id_exercise_id_key');  -- 3 rows
select conname from pg_constraint
 where conname like 'mesocycles_%' or conname like 'sessions_%' or conname like 'session_exercises_%'
 order by 1;   -- includes mesocycles_active_is_well_formed, session_exercises_rep_range_ordered, …

-- RLS still deny-all on every table, zero policies
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;   -- 0 rows
select count(*) from pg_policies where schemaname = 'public';               -- 0
```
Data API spot-check (anon key from Dashboard → Project Settings → API; it is public):
```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/mesocycles?select=*" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"     # → []
```

### B3. Deployment and environment
- Merging PR #17 deploys `main` to Vercel production. Check that the deployment is green (Vercel dashboard → Deployments).
- **No new environment variables.** Nothing secret is `NEXT_PUBLIC_`; the client-bundle guard passed. The service-role key must still not be in Vercel.
- `/plan`, `/plan/new`, `/plan/[id]…` require sign-in: an incognito visit to `/plan` should land on `/login`.

### B4. Smoke test on your phone (real-shaped data)
Use your real first block where you can: none of these steps create throwaway data except 6.

1. **Plan home empty state:** open **Plan** → "No mesocycle yet. Create your first one."
2. **Presets create structure only:** New mesocycle → choose **Push / Pull / Legs** (leave 5 / 5) → Create draft.
   - Expect Mon Push Day 1 · Tue Pull Day 1 · Wed Leg Day 1 · Thu Push Day 2 · Fri Pull Day 2 · Sat Leg Day 2 · Sun Rest.
   - Every session says "No exercises yet".
   - The checklist lists "Add a start date" and the six empty sessions.
   - (Optional: create an Arnold and a Bro draft to check those weeks too, then Archive draft from each header menu.)
3. **Build sessions:** Edit details → set the start date. Then, for each day:
   - open the session → Add exercise → search or Favorites → enter sets and the rep range;
   - check that a backwards range (10–8) is refused, and that the exercise you just added shows "In session" in the picker;
   - reorder with **Reorder**.
4. **Schedule:**
   - Move a session onto an occupied day → you're asked before replacing, and the other session appears under "Not on the schedule".
   - Duplicate Push Day 1 onto another day → you land on "Push Day 1 Copy"; edit it and confirm Push Day 1 is unchanged.
5. **Activation:**
   - when the checklist reads "Ready to activate", tap **Activate** → the dialog names the start date → confirm;
   - Plan home shows it as **Active**.
6. **Archived-exercise repair** (uses a throwaway custom exercise):
   - Exercises → Add custom exercise `[smoke] Fly` → add it to a session → archive it from its detail page;
   - the active plan shows **Needs attention**, and the slot reads "Archived · Replace or remove it";
   - open it → Replace exercise → pick another → the slot keeps its sets and reps, and the checklist clears.
7. **Clone-forward:**
   - Plan home → **Clone previous** → your active block;
   - the setup shows "<name> Copy" and a start date the day after the block ends;
   - Create draft → same week, same exercises, a draft;
   - the source is untouched and still active;
   - Archive draft if you don't want it.
8. Check light and dark (Settings or OS), and that every primary action sits at the bottom within thumb reach.

### B5. Rollback / recovery
- **Code:** Vercel → Deployments → promote the previous production deployment. The Pitch 2 code ignores plan tables, so it runs fine against the migrated schema.
- **Schema:** don't write down-migrations. The changes are additive and constraint-only; leaving them in place under older code is safe. A migration that failed mid-apply changed nothing (one transaction); see B1.3.
- **Plan data:** Mesocycles are never deleted by the app. Abandoned drafts can be archived. An active block is replaced only by activating another draft, which archives it (readable, cloneable).

---

## What the autonomous run did (so you don't repeat it)

- Applied migrations 2 and 3 to the **local** stack only.
- Created and used the local-only verification account (A2) for browser checks.
- Ran every test against an embedded throwaway Postgres (never Supabase), and Playwright against a local production build with dummy public Supabase values.
- Did **not** touch `overload-prod`, production credentials, or the service-role key.
