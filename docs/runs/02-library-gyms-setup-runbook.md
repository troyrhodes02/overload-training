# Library & Gyms Setup — External Setup Runbook

Everything here is a **human / external** step the autonomous run could not (and
must not) perform: applying the migration to `overload-prod`, creating the
production image bucket, using the Supabase **service-role** key, running the
catalog import against a real Supabase project, and verifying authenticated
screens in a browser.

> **No secrets in this file.** Where a value is needed, it says *where to get it*,
> never the value itself.

## Read this first

- **Environment model** is unchanged from Foundation: local development uses the
  Supabase CLI local stack (`npx supabase start`); the only cloud project is
  **`overload-prod`**; Vercel deploys **production only**. See
  `docs/runs/01-foundation-runbook.md`.
- **Your local `.env` currently holds production values.** Anything that reads
  `.env` (Prisma CLI, `next dev`, `next build`, `npm run db:seed`) will target
  production. Before Part A, replace `.env` with the LOCAL block from
  `.env.example` (now committed). For the deliberate production steps in Part B,
  pass production values **on the command line** for that one command.
- **Deploy order matters.** The new code reads columns added by migration
  `1_library_gyms_setup`. If `main` auto-deploys to Vercel before the migration is
  applied, `/exercises` returns the error page until it is (no data is at risk —
  reads fail and writes are rejected). **Apply B1 immediately** after (ideally
  before) the production deploy of this merge. `/` and `/gyms` keep working
  either way (`/gyms` uses only pre-existing columns).
- The service-role key is used **only** by the import process on your machine.
  **Never** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel, never prefix it
  `NEXT_PUBLIC_`, never commit it.

---

## Part A — Local development (Supabase CLI stack)

### A1. Start the stack and point `.env` at it
```bash
npx supabase start            # Docker must be running
cp .env.example .env          # then fill the LOCAL values printed by `supabase start`
```
`supabase/config.toml` now declares the `exercise-images` bucket (public,
`image/jpeg`, 1 MiB) — `supabase start` creates it. Add the local
`SUPABASE_SERVICE_ROLE_KEY` printed by `supabase start` to your **shell** (or to
the local `.env`; it is a well-known local key, not a production secret).

### A2. Apply migrations locally
```bash
npx prisma migrate deploy     # applies 0_init and 1_library_gyms_setup to the local stack
```

### A3. Run the catalog import locally
```bash
npm run db:seed               # → prisma db seed → tsx prisma/seed.ts
```
Expected output (first run, empty DB): `Exercises: 876 inserted, 0 already present.`
and `Images: 873 uploaded, 0 already stored, 873 linked, 3 have no source image, 0 failed.`
(The three image-less records are `Kettlebell_Halo`,
`Kettlebell_Halo_With_Overhead_Extension`, `Kettlebell_Overhead_Triceps_Extension`
— the source has no image for them.) Image downloads come from GitHub at the
pinned commit `f00c92c`; a few transient failures are fine — re-run to retry
only the missing ones.

### A4. Verify counts (local Studio SQL editor, http://127.0.0.1:54323)
```sql
SELECT count(*) FROM exercises WHERE source_id IS NOT NULL;           -- 876
SELECT count(*) FROM exercises WHERE image_ref IS NOT NULL;           -- 873 (minus any reported failures)
SELECT count(*) FROM exercises WHERE is_favorite OR deleted_at IS NOT NULL; -- 0
SELECT muscle_group, count(*) FROM exercises GROUP BY 1 ORDER BY 2 DESC;
-- quads 148, shoulders 129, core 93, chest 84, hamstrings 79, back 72, triceps 72,
-- biceps 53, calves 28, lower_back 27, forearms 25, glutes 22, traps 15,
-- adductors 13, abductors 8, neck 8
```
Storage → `exercise-images` → `free-exercise-db/` should contain one folder per
imported exercise with a `0.jpg`.

### A5. Prove the import is idempotent
```bash
npm run db:seed
```
Expect `Exercises: 0 inserted, 876 already present.` and
`Images: 0 uploaded, …` — the counts in A4 are unchanged, and the bucket object
count is unchanged.

### A6. Local smoke test of the screens (phone width)
`npm run dev`, sign in with your local user, open the browser dev tools at
~390 px width, and walk the checklist in **Part C**.

---

## Part B — Production (`overload-prod`)

Do these from a trusted machine. Each command gets production values **only on
its own command line**.

### B1. Apply the reviewed migration (do this first)
```bash
DIRECT_URL="<overload-prod Session pooler connection, port 5432>" npx prisma migrate deploy
```
- Applies `1_library_gyms_setup`: converts `exercises.muscle_group` /
  `equipment_type` to enums **in place** (production `exercises` is empty, so the
  cast cannot fail), adds `secondary_muscles`, `source_id` (unique),
  `is_favorite`, CHECK constraints, and the helper function (EXECUTE revoked
  from `anon`/`authenticated`). **No table or column is dropped, no row inserted.**
- Never run `prisma migrate reset`, `prisma db push`, or `migrate dev` against
  production. Connection-string notes (IPv6 direct vs Session pooler,
  URL-encoding) are in the Foundation runbook B5.

Verify:
```sql
SELECT migration_name FROM _prisma_migrations ORDER BY finished_at;  -- 0_init, 1_library_gyms_setup
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;  -- zero rows
SELECT * FROM pg_policies WHERE schemaname = 'public';                     -- zero rows
SELECT has_function_privilege('anon', 'overload_array_is_distinct(anyarray)', 'EXECUTE'); -- false
```

### B2. Create / verify the production image bucket
Supabase dashboard → `overload-prod` → **Storage → New bucket**:
- Name **`exercise-images`**, **Public bucket: ON**.
- Allowed MIME types: `image/jpeg`; file size limit: 1 MB.
- **Do not add any storage policy.** With no policy, `anon`/`authenticated`
  cannot upload, update, or delete; only the service role (the import) can write.
  (The import creates the bucket itself if missing, and **refuses to run** if it
  exists but is private — it never flips posture.)

Verify public-read posture with a dummy path (expect HTTP 400/404 "not found",
**not** 401/403):
```bash
curl -I "<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/public/exercise-images/does-not-exist.jpg"
```
Verify the anon key cannot write (expect an RLS/permission error):
```bash
curl -X POST "<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/exercise-images/probe.jpg" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>" \
  -H "Content-Type: image/jpeg" --data-binary "x"
```

### B3. Confirm credentials stay server-only
- Vercel → Project → Settings → Environment Variables: **no**
  `SUPABASE_SERVICE_ROLE_KEY`; no variable containing a DB URL or service key is
  prefixed `NEXT_PUBLIC_`. Only `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public.
- The app never needs the service-role key; only Part B4 uses it, from your shell.
- **Preview deployments are being built.** During this run the Vercel GitHub
  integration built a **Preview** deployment for every PR (e.g. PR #12). The
  environment model says previews must never reach `overload-prod`: in Vercel →
  Environment Variables, make sure `DATABASE_URL` / `DIRECT_URL` (and anything
  production-only) are scoped to **Production only**, not Preview. A preview
  without DB env simply errors on DB-backed pages, which is the intended posture.
  (The autonomous run could not inspect Vercel settings — no Vercel CLI/access.)

### B4. Run the production import — exactly once
Get the service-role key from `overload-prod` → **Project Settings → API**. Run
in a shell where it is set only for this command:
```bash
DATABASE_URL="<overload-prod Transaction pooler, port 6543>" \
NEXT_PUBLIC_SUPABASE_URL="<overload-prod URL>" \
SUPABASE_SERVICE_ROLE_KEY="<overload-prod service-role key>" \
OVERLOAD_IMPORT_CONFIRM_HOST="<the host part of that DATABASE_URL>" \
npx tsx prisma/seed.ts
```
- Using `npx tsx prisma/seed.ts` directly (rather than `npm run db:seed`) avoids
  `prisma.config.ts` loading your local `.env` into the process.
- The import **refuses** a non-local host unless `OVERLOAD_IMPORT_CONFIRM_HOST`
  matches it exactly — that is the "are you sure" step.
- It also **refuses mixed targets**: the database and Storage must both be local,
  or both belong to the **same** Supabase project (the project ref in
  `NEXT_PUBLIC_SUPABASE_URL` must match the pooler user `postgres.<ref>` or the
  direct host `db.<ref>.supabase.co`), so rows and images can never land in
  different projects.
- Expected first-run output: `876 inserted`, `873 uploaded … 873 linked, 3 have no
  source image`.
- **Safe rerun:** if it was interrupted or images failed, run the identical
  command again. It inserts nothing new, re-uploads nothing that exists, and
  only links missing images. It never touches favorites, archive state, or
  custom exercises.
- Close the shell afterwards (don't leave the service key in history; on bash,
  prefix the command with a space if `HISTCONTROL=ignorespace`).

### B5. Verify imported records and images in production
Run the A4 queries in the `overload-prod` SQL editor (expect 876 / 873 / 0 and
the same muscle distribution). Then open two images directly:
```
<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/public/exercise-images/free-exercise-db/Barbell_Squat/0.jpg
<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/public/exercise-images/free-exercise-db/Barbell_Bench_Press_-_Medium_Grip/0.jpg
```
Confirm the Data API still returns nothing to the anon key:
```bash
curl "<NEXT_PUBLIC_SUPABASE_URL>/rest/v1/exercises?select=id&limit=1" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"   # expect []
curl -X POST "<NEXT_PUBLIC_SUPABASE_URL>/rest/v1/rpc/overload_array_is_distinct" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>" \
  -H "Content-Type: application/json" -d '{}'                         # expect an error, not a result
```

### B6. Production smoke test
Deploy (merging to `main` deploys production), sign in on your phone, and walk
**Part C** against production. Use clearly named throwaway records (e.g. a
custom exercise "ZZ Smoke Test" and a gym "ZZ Smoke Gym") and **archive** them
at the end — never hard-delete anything.

---

## Part C — Verification checklist (phone width first, then desktop; light and dark)

Exercise Library (`/exercises`):
- [ ] Bottom nav shows Today · Exercises · Gyms; "Add custom exercise" sits above it.
- [ ] Imported rows show images; the three image-less exercises (search "halo") show a monogram.
- [ ] Search "row" narrows as you type; Enter applies immediately; Escape / ✕ clears.
- [ ] All + Back + "row" shows rows/pulldowns only — **Hammer Curl / curls never appear under Back.**
- [ ] Star three exercises; reload — still starred. Favorites shows exactly those.
- [ ] Favorites + Back, Favorites + Chest + "press" compose; Clear keeps you in Favorites.
- [ ] Favorites with nothing starred: "No favorites yet…" with "Browse all exercises".
- [ ] Search "zercher squat" → "No exercise matches…" → "Add … as a custom exercise" pre-fills the name.
- [ ] "Show 50 more" appears for large result sets.

Custom exercise (`/exercises/new`):
- [ ] Submitting empty shows "Enter a name.", "Choose a primary muscle.", "Choose the equipment."; focus moves to Name.
- [ ] Choosing a primary removes it from "Also trains"; there is **no image field**.
- [ ] Create "ZZ Smoke Test" (Shoulders, Barbell, also Triceps) → detail page, toast "Exercise added", "Custom" badge, monogram.
- [ ] It appears under Shoulders, in search, and can be starred like an imported exercise.

Archive:
- [ ] Detail → Archive exercise → specific confirmation → toast "Archived. Past workouts keep it." with Undo.
- [ ] It disappears from All and Favorites; Undo restores it (still starred).
- [ ] Archive it again at the end of the smoke test (leave it archived).

Gyms (`/gyms`):
- [ ] Empty state "No gyms yet. Add the gym you train at."
- [ ] Add "ZZ Smoke Gym" with no location; add another "ZZ Smoke Gym" with location "5th & Main" — both listed (duplicate names allowed); location is plain text, not a link.
- [ ] Empty name shows "Enter a name."
- [ ] Row menu → Archive gym → confirm → toast with Undo; the gym leaves the list; Undo restores it. Archive both smoke gyms at the end.
- [ ] `SELECT count(*) FROM gym_exercise_baselines;` is still **0**.

Security:
- [ ] Signed out, `/exercises`, `/exercises/new`, `/gyms`, `/gyms/new` redirect to `/login`.

---

## Rollback / recovery

- **Bad deployment:** Vercel → Deployments → promote the previous good deployment.
  The migration is additive, so the previous code runs fine against the new schema.
- **Migration concern:** `1_library_gyms_setup` drops nothing. If it partially
  failed, inspect `_prisma_migrations` and re-run `prisma migrate deploy`. If the
  in-place cast ever failed (it cannot on an empty table), the error names the
  offending value; nothing is lost. Do **not** `migrate reset` production.
- **Import went wrong:** the import only inserts `exercises` rows with
  `source_id` set and Storage objects. It never touches custom exercises,
  favorites, archive state, plans, or history. If you must undo a mistaken
  import into the wrong project **before any history exists**, that is a
  deliberate manual decision outside this runbook — archiving (`deleted_at`) is
  the product's only removal; do not hard-delete exercises once anything
  references them (the database will refuse via `Restrict`).
- **Images missing/failed:** re-run B4; only missing images are fetched.
- **Bucket accidentally private:** make it public again in the dashboard (the
  app's image URLs require public-read); exercises remain usable with monograms
  meanwhile.
- **Service-role key exposed:** rotate it in `overload-prod` → Project Settings →
  API immediately. The app does not use it, so rotation has no app impact.

## What the autonomous run did (so you don't repeat it)

- Wrote and tested the migration, the import, the screens, and the guards
  against a **throwaway embedded Postgres** with an in-memory Storage fake.
- Did **not** contact any Supabase project (local or cloud), did **not** run the
  import, did **not** use the service-role key or any production credential,
  and did **not** render authenticated screens (no Auth backend was available).

## Downstream

Once B1–B6 are complete and Part C passes, **Split & Mesocycle Setup** can build
its exercise picker on `listExercises` / `LibraryControls` / `FavoriteButton`
(active-only by default), and **Guided Workout Logging** can rely on stable gym
and exercise identity plus `primaryMuscle` and `equipmentType`.
