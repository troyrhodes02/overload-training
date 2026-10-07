# Library & Gyms Setup — Autonomous Run Report

**Pitch:** Overload — Pitch: Library & Gyms Setup (slug `02-library-gyms-setup`)
**Project / milestone:** Overload V1 → Library & Gyms Setup
**Date:** 2026-10-07

## Feature PR and merge status

- **PR #7 — https://github.com/troyrhodes02/overload-training/pull/7** (`feat/02-library-gyms-setup` → `main`).
- **Merged into `main`** by squash under the run's standing merge-on-green rule, after review, audit, and a final full green verification of the exact tree that was merged. (If a reader finds PR #7 still open, the merge step did not complete. See the progress file.)
- ⚠️ **Merging to `main` triggers a production deploy (Vercel is connected).** The new code needs migration `1_library_gyms_setup`. Until a human applies it (runbook **B1**), `/exercises` shows the error page. No data is at risk: reads fail and writes are rejected. `/` and `/gyms` keep working. **Applying B1 is the first external step.**

## What was built

- **Exercise catalog:** the `free-exercise-db` snapshot, pinned and vendored, imported by a re-runnable Prisma seed (`npm run db:seed` → `tsx prisma/seed.ts`) into `exercises`, with one image per exercise copied into Overload's public `exercise-images` bucket. The app never contacts the source at runtime.
- **One canonical vocabulary:** 16 `MuscleGroup` values and 13 `Equipment` values, as Postgres enums plus `src/lib/exercises/taxonomy.ts`. Every exercise has exactly one primary muscle. Secondary muscles are optional, distinct, and never equal the primary. Both rules are enforced by DB CHECK constraints as well as the app.
- **Favorites:** a manual `isFavorite` flag, the All/Favorites scope, and composable All/Favorites × **primary** muscle × name search (every word must match, LIKE wildcards escaped).
- **Custom exercises:** name, primary muscle and equipment are required; secondary muscles are optional; there is no image.
- **Archival:** exercises and gyms are archived via `deletedAt`, with a confirmation dialog and an Undo toast. Nothing is ever hard-deleted. History still resolves archived rows.
- **Gyms:** name required, location optional plain text. Creating a gym creates **no** baseline.
- **Screens:** `/exercises`, `/exercises/[id]`, `/exercises/new`, `/gyms`, `/gyms/new`. Nav is now Today · Exercises · Gyms.

## Linear issues (actual identifiers)

| Ticket | Title | PR | State |
| ------ | ----- | -- | ----- |
| OVE-10 | Library & Gyms data model: canonical vocabularies, Exercise classification migration, repo hygiene | #8 → squash 7ccd9e4 | Done |
| OVE-11 | free-exercise-db catalog import: pinned snapshot, normalization, idempotent exercise + image import | #9 → squash 82057a9 | Done |
| OVE-12 | Exercise Library data layer & server actions | #10 → squash 3f22c2d | Done |
| OVE-13 | Exercise Library UI | #11 → squash 5a19139 | Done |
| OVE-14 | Gym Management + deliberate-absence guards | #12 → squash 9efba00 | Done |

Milestone **Library & Gyms Setup** (`6cbb9134-58a3-4f91-8671-83585956891a`). The `blockedBy` chain is OVE-10 ← 11 ← 12 ← 13 ← 14. Every ticket PR was squash-merged into the feature branch through GitHub. PR #12 needed the feature branch merged into its branch first (add/add conflicts on files that OVE-13 introduced and OVE-14 extended). I resolved them to the OVE-14 side after verifying the feature tree was byte-identical to OVE-13. No force-push was used.

## Final verification (all actually run on the audited feature branch, with throwaway DB overrides)

| Check | Command | Result |
| ----- | ------- | ------ |
| Lint | `npm run lint` | ✅ |
| Format | `npm run format:check` | ✅ |
| Schema | `npx prisma validate` | ✅ |
| Build | `npm run build` | ✅ |
| Typecheck | `npm run typecheck` (after build) | ✅ |
| Unit | `npm test` | ✅ 101 passed / 13 suites |
| Integration | `npm run test:integration` (embedded Postgres 18) | ✅ 54 passed / 7 suites |
| Browser | `npm run test:e2e` (Playwright, system Chrome) | ✅ 9 passed |
| Client-bundle secret guard | `npm run verify:client-bundle` | ✅ |

Standing Foundation invariant tests are included above and green: RLS on every table and zero policies, the anon role reads nothing, `Restrict` blocks hard deletes, no derived columns, no ownership column, the static `LoggedSet` write guard, and secret hygiene.

### Pitch-specific required tests → where they live

- **Import / external dependency:** reads local data, never the source. Static guard `invariant-guards.test.ts` (no `src/` reference to the dataset or its host) plus integration tests that read rows inserted directly. No duplicate rows on rerun and no duplicate image objects on rerun (`catalog-import.int.test.ts`). Identity is by source id, not name (same-name records both imported). A custom exercise with a similar name is untouched.
- **Muscle classification:** exactly one primary is enforced by the NOT NULL enum and by a full-dataset normalization test. Secondary muscles are optional. Primary ∉ secondary and duplicate secondaries are rejected by both the app and DB CHECKs (`exercise-classification.int.test.ts`). The Back filter excludes secondary-Back exercises (`exercise-library.int.test.ts`). Imported secondaries are a subset of the muscles the source itself lists, checked over all 876 records.
- **Favorites:** favorite and unfavorite persist; imported and custom exercises both work; Favorites composes with muscle, search, and both together. An archived exercise is absent from Favorites while `isFavorite` is kept. The import never clears or creates favorites.
- **Custom exercises:** name, primary and equipment are required; secondaries are optional; there is no image (smuggled image or source fields are ignored, and a DB CHECK backs it up). They behave like imported exercises in search, filter and Favorites.
- **Archival and history integrity:** archived exercises and gyms are excluded from active selection, are never hard-deleted, and `LoggedExercise → Exercise` and `→ Gym` still resolve after archival (`exercise-library.int.test.ts`, `gyms.int.test.ts`).
- **Gym rules:** a name is required; location may be omitted; duplicate names are allowed; no baseline is created; there are no map dependencies, routes or coordinates (`gyms.int.test.ts`, `deliberate-absences.test.ts`).
- **Images and storage:** there is no upload path (static guard on file inputs, Storage use and `.upload(` in `src/`). The service-role key is never referenced under `src/` and the bundle guard passes. An image failure leaves the exercise usable (`imageRef` stays null, monogram fallback, retried on rerun).
- **Deliberate absences** (`deliberate-absences.test.ts`): no logging, plan, baseline, goal or cardio writes; no `isGymVariable`, baseline correction, e1RM, progression, swap or missed-day code; only the `exercises` and `gyms` app routes; no map or geocoding dependencies, geolocation, or coordinates in code or schema; no recently-used or recommendation code; favorites are written only by the explicit toggle.
- **Auth boundary:** unauthenticated requests to every new route redirect to `/login` (Playwright), and every new server action calls `requireUser()` before any write (unit).

**Not verified:** I could not render the authenticated screens, including phone-width layout, light/dark themes and keyboard/focus behaviour. No Supabase Auth backend was available: Docker was down, there is no local stack, and production is off-limits. Runbook Part C is the manual checklist.

## Decisions made autonomously (full table in spec `## Resolved Decisions`)

- **D1–D19:** the pre-resolved decisions from the run instruction, recorded as approved authority.
- **D20:** Postgres enums, with columns converted **in place** by a hand-written `ALTER COLUMN … TYPE … USING`. Prisma's generated diff was `DROP COLUMN` + `ADD COLUMN`, which is destructive and a stop condition. Column names were kept; the Prisma field is `primaryMuscle @map("muscle_group")`.
- **D21:** `lats` + `middle back` → `back` (the pitch classes Lat Pulldown and Barbell Row both as Back, and swaps need them grouped). `lower back` stays separate. `abdominals` → `core` and `quadriceps` → `quads`, following the pitch's vocabulary.
- **D22:** `null` equipment → `other`. Added `plate_loaded` for custom exercises only, because the source cannot distinguish plate-loaded machines.
- **D23:** for the one record with two primaries, the first wins and the second becomes a secondary.
- **D24:** imported all 876 records, every category. `category`, `level`, `force` and `instructions` are not stored.
- **D25:** one image per exercise (`images[0]`) at `free-exercise-db/<sourceId>/0.jpg`.
- **D26:** vendored the pinned JSON (SHA verified by a test). Images are fetched at import time from the pinned commit.
- **D27:** the import never updates existing rows; it only inserts missing rows and links missing images.
- **D28:** the seed is its own process with its own `PrismaClient` (`src/lib/db.ts` is `server-only`). Added `tsx` as a devDependency (flagged).
- **D29:** the import refuses unless the database and Storage are the same environment, and a remote run requires the exact DB host to be confirmed. This was strengthened after review.
- **D30:** archive uses a confirm dialog plus an Undo toast. Undo is the only unarchive; a repo convention allows it per pre-resolved §11.
- **D31:** filters live in the URL, the list is server-rendered, pages are 50 rows, and "Show more" goes up to 1000.
- **D32:** search requires every word to match, in any order, case-insensitive, on names only.
- **D33:** plain lazy `<img>` instead of `next/image`.
- **D34:** shadcn/ui `sonner` for toasts (flagged), without `next-themes`.
- **D35:** Exercises and Gyms are top-level nav items.
- **D36:** repo hygiene needed to make the standing suite green on a fresh checkout: `.gitattributes` `eol=lf`, a committed `.env.example`, and a synced lockfile.
- **D37:** the Foundation "no seed script" guard was replaced with "the seed imports the catalog only".
- **D38:** no authenticated E2E tests (no Auth backend).
- **D39:** validation limits (exercise name 100, gym name 80, address 200, at most 15 secondaries).

## Final source taxonomy / mapping (also in `docs/planning/method-note.md`)

**Muscles (source → canonical):** chest→chest · lats→back · middle back→back · lower back→lower_back · traps→traps · shoulders→shoulders · biceps→biceps · triceps→triceps · forearms→forearms · abdominals→core · quadriceps→quads · hamstrings→hamstrings · glutes→glutes · calves→calves · adductors→adductors · abductors→abductors · neck→neck.

**Equipment (source → canonical):** barbell→barbell · e-z curl bar→ez_bar · dumbbell→dumbbell · kettlebells→kettlebell · cable→cable · machine→machine · body only→bodyweight · bands→band · medicine ball→medicine_ball · exercise ball→exercise_ball · foam roll→foam_roller · other→other · *null* (77)→other · (no source value)→plate_loaded.

**Resulting primary distribution (876):** quads 148, shoulders 129, core 93, chest 84, hamstrings 79, back 72, triceps 72, biceps 53, calves 28, lower_back 27, forearms 25, glutes 22, traps 15, adductors 13, abductors 8, neck 8.

## Secondary-muscle metadata gaps

**Yes.** 272 source records have no secondary muscles, and they keep an empty set; nothing was invented. After normalization, 277 records have no secondaries: 5 more listed only muscles that map to their own primary. 65 source secondary entries were dropped because they equalled the primary (mostly lats/middle-back pairs), and 6 were collapsed as duplicates. One record had two source primaries.

## Import results

- **Real Supabase import: not run.** The autonomous run may not touch production credentials or data, and no local stack was available. It is runbook steps A3 and B4.
- **Proven against the throwaway DB with an in-memory Storage fake, using the full pinned dataset:** 876 inserted; a rerun inserted 0 and reported 876 already present. Images: 873 uploaded and linked, 3 with no source image (`Kettlebell_Halo`, `Kettlebell_Halo_With_Overhead_Extension`, `Kettlebell_Overhead_Triceps_Extension`), 0 failures. Rerun: 0 uploaded. Injected image failure: the exercise stays usable, the failure is reported, and the next run retries it.
- Pinned image URLs at commit `f00c92c` return HTTP 200 (spot-checked).

## Review findings and dispositions

`/code-review high 7 --comment` left 10 inline findings on PR #7. `/overload-review-audit` dispositions were posted as replies on each comment.

| # | Finding | Validity / scope | Disposition |
| - | ------- | ---------------- | ----------- |
| 1 | React 19 form auto-reset + Radix Select wipes primary/equipment after a failed save | VALID (confirmed in Radix source) / IN_SCOPE | **IMPLEMENTED**: manual `startTransition(formAction)` submit (both forms) |
| 2 | Pending search debounce undoes a tab or muscle change | VALID / IN_SCOPE | **IMPLEMENTED**: navigation cancels the debounce; the timer reads the latest state |
| 3 | Search box can desync after Back/Forward | VALID / IN_SCOPE | **IMPLEMENTED**: `lastNavigated` resets on external URL change |
| 4 | Import guard checked the DB but not the Storage target | VALID / IN_SCOPE (prod safety) | **IMPLEMENTED**: same-environment and same-project-ref check, tests, runbook |
| 5 | Modal dialog opened from a modal dropdown can strand `pointer-events` | UNCERTAIN → safe default | **IMPLEMENTED**: `DropdownMenu modal={false}` |
| 6 | "Show more" limit carried into new filters | VALID / IN_SCOPE | **IMPLEMENTED** |
| 7 | "Show more" dead past 1000 | VALID / IN_SCOPE | **IMPLEMENTED**: capped, with a note to narrow |
| 8 | Wasted `refresh()` on archive before navigating away | VALID / IN_SCOPE | **IMPLEMENTED** |
| 9 | Two queries per favorite toggle | VALID / IN_SCOPE | **IMPLEMENTED**: update first, look up only on failure |
| 10 | Two existence probes on every library render | VALID, negligible | **SKIPPED**: parallel indexed probes for one user; making the DTO conditional costs clarity |
| 11 | *(self-found during the review window)* Storage adapter treated storage-js's `{ data:false }` "missing object" as an error unless the message matched a regex, which could fail every image on a fresh bucket | VALID / IN_SCOPE | **IMPLEMENTED**: `exists` returns `data === true`; 409 and 404 handled by status; 7 adapter unit tests |

Bugs the run's own tests caught before review: Prisma's `contains` does **not** escape `%` and `_` (search was wildcarding), now escaped. A debounced navigation could also overwrite in-progress typing, fixed before review.

## Deferrals

None created as Linear issues. The one skipped finding (#10) needs neither a ticket nor a code comment.

## Genuinely undecidable

Nothing blocking. Owned by later pitches:
- Which `Equipment` values are gym-variable. Note: imported `machine` includes plate-loaded machines indistinguishably.
- Whether an archived-items screen or unarchive beyond Undo is wanted.

## Near-misses (approached out-of-scope behaviour)

- **Destructive migration:** Prisma's generated diff dropped and re-added the classification columns. It was replaced by a hand-written in-place conversion, and a static guard now fails any later migration that drops, renames, inserts, cascades or adds a policy.
- **Production-pointed `.env`:** the local `.env` held production values. All commands ran with explicit throwaway overrides, and the import got a same-environment, confirmed-host guard.
- **Undo vs. "no restoration":** kept to the immediate Undo only, under a repo convention, with no archived-items screen.
- **`plate_loaded`:** added to the vocabulary for custom exercises only. No imported exercise is guessed into it, and no gym-variable rule was written.
- **shadcn CLI** pulled in an unrelated npm package `cn` (it mis-resolved the utils alias). Removed, and imports fixed.
- **Category curation:** I resisted filtering out stretching and cardio records (an unrequested product decision).
- **Gym location:** plain text only, with no link, autocomplete or geolocation. Guards prevent coordinates in code or schema.

## Required upstream amendments (`docs/planning/` not edited, except the allowed `method-note.md`)

Intentional planning amendments introduced by this pitch:
1. **Exercise Library — Favorites:** add favorite/unfavorite and a persistent Favorites scope that composes with search and primary-muscle filtering.
2. **Exercise model — primary/secondary muscles:** replace the single "muscle group" with one required primary plus optional secondaries. Primary controls filtering and Exercise Swap.
3. **Custom Exercise:** replace "name only" with name + primary muscle + equipment, optional secondaries, and no image.
4. **Gym location:** replace the PRD's "pinned location" with optional free-text location and no mapping.
5. **Architecture data model:** Exercise gains `primaryMuscle` (enum), `secondaryMuscles` (enum array), `equipmentType` (enum), `sourceId` (unique import identity) and `isFavorite`. Also record the image bucket as public-read and import-only.
6. **Custom Exercise editing/notes inconsistency:** the PRD journey mentions editing names/notes, but the roadmap and architecture do not place it in Pitch 2. Not built; reconcile upstream.

Carried over from Foundation and still pending: the Architecture "styling undecided" text and the "separate dev project" text. Also: Vercel builds **preview** deployments for PRs, so confirm DB env vars are Production-scoped (runbook B3).

## External / manual steps still required (`docs/runs/02-library-gyms-setup-runbook.md`)

1. **B1:** apply migration `1_library_gyms_setup` to `overload-prod` (do this first; the merge deploys code that needs it).
2. **B2:** create or verify the public `exercise-images` bucket, with no storage policies. Verify public-read and that anon cannot write.
3. **B3:** confirm the service-role key is not in Vercel, nothing secret is `NEXT_PUBLIC_`, and DB env vars are not exposed to Preview.
4. **B4:** run the production import once (`npx tsx prisma/seed.ts` with explicit env and confirm host). It is safe to re-run.
5. **B5:** verify counts (876 / 873), representative images, and that the Data API and RPC are still closed.
6. **B6 + Part C:** phone smoke test: search/filter/favorites, custom creation, archive/Undo, gyms, then archive the smoke records.
7. Locally (Part A): replace the production-valued `.env` with local values before any local dev.

## Downstream readiness

- **Split & Mesocycle Setup can rely on the Exercise Library contract:** yes. Stable exercise IDs; `listExercises` (active-only by default) and its URL filters; Favorites; every exercise has a primary muscle and equipment; reusable `LibraryControls`, `FavoriteButton`, `ExerciseThumb`. It still needs the production import (B4) to have real data in prod.
- **Guided Workout Logging can rely on the Gym and equipment contracts:** yes. Explicit, stable gym records (active-only via `listActiveGyms`; history must read without the `deletedAt` filter); `equipmentType` enum for `isGymVariable` (no name parsing); `primaryMuscle` for swap equivalence; no baselines exist yet.

## Halt status

Not halted. No stop condition was hit: no invariant was weakened, no approved doc was contradicted or edited (except `method-note.md`), and no production data or credentials were touched. The only destructive operation proposed (Prisma's DROP/ADD diff) was replaced, not run. There was no force-push or history rewrite.
