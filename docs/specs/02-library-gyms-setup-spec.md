---
version: 1.0.0
status: approved
author: Autonomous pipeline (Claude Code)
last_updated: 2026-10-07
pitch_reference: pitches/02-library-gyms-setup.md
design_reference: docs/design/02-library-gyms-setup-design-doc.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: see docs/runs/02-library-gyms-setup-progress.md (milestone "Library & Gyms Setup")
---

# Library & Gyms Setup

## Summary

Library & Gyms Setup gives Overload its two reference vocabularies: an **exercise catalog** (the 876-record `free-exercise-db` dataset imported once into Overload's own `exercises` table and `exercise-images` Storage bucket, plus the lifter's custom exercises) and a **gym directory**. The lifter browses the catalog through one list narrowed by three composable filters — scope (All / Favorites), **primary** muscle group, and name search — stars favorites, adds custom exercises with enough classification to behave like imported ones, archives exercises and gyms, and adds gyms by name with optional free-text location.

The core abstraction is **one `Exercise` row per movement, classified by a single canonical vocabulary**: exactly one `primaryMuscle` (a Postgres enum), zero or more distinct `secondaryMuscles` (an enum array that can never contain the primary), and one `equipmentType` (a Postgres enum). Imported and custom exercises share that vocabulary and every query; they differ only in provenance (`sourceId` vs `isCustom`) and image (`imageRef`). Favorites are a boolean on the exercise. Archival is `deletedAt`. The source dataset is an **ingest** dependency only: a seed script reads a vendored, pinned snapshot, normalizes it through an explicit mapping, inserts missing rows idempotently by stable source id, and copies one image per exercise into Storage idempotently. The running app never contacts the source.

"Working" means: after the import, `/exercises` lists the catalog with images; "Favorites + Back + `row`" returns exactly the favorited, primary-Back, name-matching active exercises; a custom "Landmine Press / Shoulders / Barbell" appears under Shoulders and can be starred; archiving hides an exercise or gym from every selection query while every historical reference still resolves; re-running the import changes nothing; and no gym baseline, plan, or log is created anywhere.

---

## Problem

- The app cannot yet name an exercise. Split & Mesocycle Setup (Pitch 3) cannot place a movement into a session, and Guided Workout Logging (Pitch 4) cannot record one.
- The app cannot yet name a gym, so Pitch 4 has nothing to attribute a machine's working weight to.
- The Foundation schema has `Exercise.muscleGroup` and `Exercise.equipmentType` as free strings. Without one enforced vocabulary, Exercise Swap's "same muscle group" rule (PRD) and Pitch 4's gym-variable equipment rule would each invent their own taxonomy.
- An ~900-movement catalog is unusable on a phone without a personal subset (Favorites) and composable narrowing.
- Supports PRD journey **"Managing the exercise library and gyms"** and the MVP features **Exercise Library** and **Gym Management** (gym-specific weight tracking is explicitly deferred). Depends on Foundation; unlocks Pitch 3 and Pitch 4.

---

## Scope and Non-Scope

### In Scope

- One-time, re-runnable import of `free-exercise-db` (pinned snapshot) into `exercises` + Storage.
- Canonical muscle-group and equipment vocabularies with explicit source mappings.
- Primary (required, exactly one) and secondary (optional, distinct, never the primary) muscle classification, enforced in the database.
- Favorites: manual, persistent, exercise-level toggle; Favorites scope.
- Library list: All/Favorites × primary muscle × name search, composable, paginated.
- Exercise detail (image, primary, also-trains, equipment).
- Custom exercise creation (name + primary + equipment required; secondaries optional; no image).
- Exercise archival (+ immediate Undo).
- Gym list, gym creation (name required, free-text location optional), gym archival (+ immediate Undo).
- Nav entries "Exercises" and "Gyms".
- Repo hygiene required to get the standing suite green on a fresh Windows checkout (see D36).

### Out of Scope

- Split/mesocycle/session building and any exercise picker inside a plan (Pitch 3).
- Workout logging, `LoggedSession`/`LoggedExercise`/`LoggedSet` writes, swaps, missed days, past-log editing (Pitch 4).
- `GymExerciseBaseline` creation or correction, `isGymVariable`, working weights (Pitch 4).
- Progress/hold/deload, e1RM, charts (Pitch 5).
- Editing custom exercises, exercise notes, editing gyms — **required upstream amendment** (see Open Questions / report).
- An archived-items management screen or unarchive beyond the immediate Undo.
- Custom exercise images, user uploads, any second image source.
- Maps, geocoding, coordinates, GPS, proximity, arrival detection — deferred to the mobile phase.
- Recently used / most used / recommendations / auto-favoriting.
- Any use of secondary muscles in filtering, swaps, volume, fatigue, or progression.
- Permanent non-goals: program generation, social features, cardio progression, nutrition/body composition.

---

## Core Concepts

| Concept | Description |
| ------- | ----------- |
| `Exercise` | One movement. Imported (from `free-exercise-db`, `sourceId` set, `isCustom=false`) or custom (`isCustom=true`, `sourceId` null, `imageRef` null). Identity is the UUID; names are not unique. Soft-deleted via `deletedAt`. Persisted. |
| `MuscleGroup` | Canonical 16-value Postgres enum, the **single** muscle vocabulary for imported and custom exercises and for Pitch 4's swap rule. |
| `Equipment` | Canonical 13-value Postgres enum, the **single** equipment vocabulary. Pitch 4 decides which values are gym-variable. |
| `Exercise.primaryMuscle` | Exactly one `MuscleGroup`, NOT NULL. Authoritative for the library muscle filter and future Exercise Swap equivalence. (DB column remains `muscle_group`.) |
| `Exercise.secondaryMuscles` | `MuscleGroup[]`, default empty. Descriptive metadata only. DB-enforced: no duplicates, never contains `primaryMuscle`. |
| `Exercise.isFavorite` | Boolean, default false. Set only by the lifter's explicit toggle. Persisted. Untouched by archival and by the import. |
| `Exercise.sourceId` | Stable `free-exercise-db` record id (e.g. `Barbell_Bench_Press_-_Medium_Grip`). Unique. The import's identity key — never the display name. |
| `Exercise.imageRef` | Storage object path inside the `exercise-images` bucket (e.g. `free-exercise-db/Barbell_Squat/0.jpg`), or null. Always null for custom exercises. |
| `Gym` | A named place. `name` required, `address` optional free text. Soft-deleted via `deletedAt`. Names not unique. |
| Active | `deletedAt IS NULL`. Every selection query (library, favorites, gym list, later pickers) filters on it. History reads never do. |
| Favorites scope | Active exercises with `isFavorite = true`. Derived by query, never stored separately. |

**Distinctions to preserve:**

- Primary vs secondary muscle: only primary participates in product logic. A Back filter never returns an exercise whose Back involvement is secondary.
- Favorite vs plan: favoriting adds nothing to any plan and implies nothing about training.
- Archive vs delete: no code path hard-deletes an `Exercise` or `Gym`. Archived rows still resolve by id.
- Import vs user preference: the import owns catalog ingestion; it never writes `isFavorite`, `deletedAt`, `isCustom`, or any custom row.
- No ownership column: single-user, none added.

---

## States and Lifecycle

### Exercise / Gym lifecycle

```text
active    (deletedAt IS NULL)
archived  (deletedAt IS NOT NULL)
```

### State Transition Rules

| From | To | Allowed? | Side Effects |
| ---- | -- | -------- | ------------ |
| (none) | `Exercise.active` (custom) | yes, `createCustomExercise` | row inserted, `isCustom=true`, `isFavorite=false`, `imageRef=null` |
| (none) | `Exercise.active` (imported) | yes, import only | row inserted by `sourceId`; `isFavorite=false` |
| `Exercise.active` | `Exercise.archived` | yes, `archiveExercise` | sets `deletedAt=now()`; **nothing else** (favorite state retained, no history touched) |
| `Exercise.archived` | `Exercise.active` | yes, **only** `restoreExercise` invoked by the archive toast's Undo | clears `deletedAt`; favorite state is whatever it was |
| `Exercise.archived` | `Exercise.archived` | idempotent no-op | none |
| any | hard-deleted | **never** | (FKs from history use `Restrict`; no app code calls `delete`) |
| `Gym.active` ↔ `Gym.archived` | same rules as Exercise | yes | archive/restore set/clear `deletedAt` only; no baseline row is created, read, or touched |
| `isFavorite false` ↔ `true` | yes, active exercises only | `setExerciseFavorite` | single-column update; archived → `invalid_state_transition` |

Confirmation: archive uses a short specific confirm dialog plus an Undo toast (design doc §8). Rationale in D30.

There are no multi-row dependent writes in this pitch; every mutation is a single-row update/insert. Write functions still accept an optional transaction client per `CLAUDE.md`.

---

## UI Integration

> Detailed UI/UX is in `docs/design/02-library-gyms-setup-design-doc.md`.

### Screens

| Screen | Route | Purpose | Data Needed | Actions |
| ------ | ----- | ------- | ----------- | ------- |
| Exercise Library | `/exercises?view&muscle&q&limit` | find + star | `listExercises(filters)` → items, total, `hasAnyActive`, `hasAnyFavorites` | toggle favorite, open detail, go to create |
| Exercise Detail | `/exercises/[id]?from` | classification + image | `getExercise(id)` (resolves archived too) | toggle favorite, archive |
| Add Custom Exercise | `/exercises/new?name` | create | vocabularies (static) | `createCustomExerciseAction` |
| Gyms | `/gyms` | list | `listActiveGyms()` | archive (row menu), go to create |
| Add Gym | `/gyms/new` | create | — | `createGymAction` |

All are server components under the `(app)` group (auth-gated by Foundation's layout `requireUser()`); each segment gets a `loading.tsx` skeleton.

### Components (client islands only where interactive)

| Component | Kind | Data Contract | Notes |
| --------- | ---- | ------------- | ----- |
| `LibraryControls` | client | `{ view, muscle, q }` from URL | writes URL params via `useRouter`; search debounced 250 ms with `replace`; scope/muscle `push` |
| `FavoriteButton` | client | `{ exerciseId, name, isFavorite }` | `useOptimistic` + `setExerciseFavoriteAction`; reverts + error toast on failure |
| `ExerciseThumb` | client | `{ name, imageUrl, size }` | `<img>` with `onError` → `MonogramTile` |
| `ArchiveDialog` | client | `{ kind: "exercise" \| "gym", id, name, redirectTo? }` | confirm → archive action → toast with Undo → restore action |
| `CustomExerciseForm` | client | `{ defaultName? }` | `useActionState(createCustomExerciseAction)`; field errors from `details` |
| `GymForm` | client | — | `useActionState(createGymAction)` |
| `ExerciseRow`, `MonogramTile`, `FilterSummary`, `EmptyState`, `GymRow` | server | DTOs below | presentational |

Client islands never import Prisma, `lib/db.ts`, or any server module except server actions; they import the vocabulary from `src/lib/exercises/taxonomy.ts` (pure, no Prisma import).

### Forms and Validation

| Field | Type | Required | Validation | Notes |
| ----- | ---- | -------- | ---------- | ----- |
| exercise `name` | string | yes | trim; 1–100 chars | duplicates allowed |
| `primaryMuscle` | `MuscleGroup` | yes | in vocabulary | |
| `equipmentType` | `Equipment` | yes | in vocabulary | |
| `secondaryMuscles` | `MuscleGroup[]` | no | each in vocabulary; server **rejects** a value equal to primary and rejects duplicates (`validation_error`) | the form prevents both by construction |
| gym `name` | string | yes | trim; 1–80 chars | duplicates allowed |
| gym `address` | string | no | trim; ≤ 200 chars; empty → null | free text only |

### shadcn/ui integration

Add from shadcn/ui (Radix-based, same system): `badge`, `card` (if needed), `dialog`, `select`, `tabs`, `toggle`, `sonner`. `sonner` is shadcn/ui's toast component (design-doc skill mandates it); its theme follows `system` via a small wrapper — no `next-themes` dependency is added (D34). Exercise images use a plain `<img loading="lazy">` (D33).

---

## Data Model

### Relationship to Existing Schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `SessionExercise`, `LoggedExercise`, `GymExerciseBaseline`, `Goal` | many → one | `Exercise` | unchanged; all `onDelete: Restrict` |
| `LoggedExercise`, `GymExerciseBaseline` | many → one | `Gym` | unchanged; `onDelete: Restrict` |
| `Exercise` | — | Storage object | `imageRef` is a path string, not an FK |

No new tables. No relation changes. No change to any logged-history model.

### Enums (new)

```prisma
/// Canonical Overload muscle-group vocabulary (Library & Gyms Setup, D6).
/// One vocabulary for imported exercises, custom exercises, the library
/// filter, and (later) Exercise Swap. Source mapping: docs/planning/method-note.md.
enum MuscleGroup {
  chest
  back
  lower_back
  traps
  shoulders
  biceps
  triceps
  forearms
  core
  quads
  hamstrings
  glutes
  calves
  adductors
  abductors
  neck
}

/// Canonical Overload equipment vocabulary (D8). Which values are
/// gym-variable is decided later, in exactly one function (isGymVariable).
enum Equipment {
  barbell
  ez_bar
  dumbbell
  kettlebell
  cable
  machine
  plate_loaded
  bodyweight
  band
  medicine_ball
  exercise_ball
  foam_roller
  other
}
```

### Updated Models

```prisma
model Exercise {
  id               String        @id @default(uuid()) @db.Uuid
  name             String
  /// Exactly one primary muscle. Column keeps its Foundation name.
  primaryMuscle    MuscleGroup   @map("muscle_group")
  /// Zero or more, distinct, never the primary (DB CHECK constraints).
  secondaryMuscles MuscleGroup[] @default([]) @map("secondary_muscles")
  equipmentType    Equipment     @map("equipment_type")
  imageRef         String?       @map("image_ref")
  isCustom         Boolean       @default(false) @map("is_custom")
  /// free-exercise-db record id; null for custom exercises. Import identity.
  sourceId         String?       @unique @map("source_id")
  isFavorite       Boolean       @default(false) @map("is_favorite")
  deletedAt        DateTime?     @map("deleted_at") @db.Timestamptz
  createdAt        DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  sessionExercises SessionExercise[]
  loggedExercises  LoggedExercise[]
  baselines        GymExerciseBaseline[]
  goals            Goal[]

  @@index([primaryMuscle])
  @@index([deletedAt])
  @@map("exercises")
}

model Gym { /* unchanged fields; name gains a non-blank CHECK in SQL */ }
```

### Migration `1_library_gyms_setup` (hand-written; reviewed)

Prisma's auto-generated diff for a `String` → enum change is `DROP COLUMN` + `ADD COLUMN`, which is destructive. That is **forbidden** (stop condition 4). The migration is hand-written to convert in place with `ALTER COLUMN ... TYPE ... USING`, which preserves any rows and fails loudly (rather than losing data) if a value is outside the vocabulary. Production `exercises` is empty (Foundation seeded nothing), so the cast cannot fail there.

```sql
CREATE TYPE "MuscleGroup" AS ENUM ('chest','back','lower_back','traps','shoulders','biceps','triceps','forearms','core','quads','hamstrings','glutes','calves','adductors','abductors','neck');
CREATE TYPE "Equipment"   AS ENUM ('barbell','ez_bar','dumbbell','kettlebell','cable','machine','plate_loaded','bodyweight','band','medicine_ball','exercise_ball','foam_roller','other');

ALTER TABLE "exercises"
  ALTER COLUMN "muscle_group"   TYPE "MuscleGroup" USING "muscle_group"::"MuscleGroup",
  ALTER COLUMN "equipment_type" TYPE "Equipment"   USING "equipment_type"::"Equipment",
  ADD COLUMN "secondary_muscles" "MuscleGroup"[] NOT NULL DEFAULT ARRAY[]::"MuscleGroup"[],
  ADD COLUMN "source_id" TEXT,
  ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "exercises_source_id_key" ON "exercises"("source_id");

-- Helper for the no-duplicate CHECK (CHECK constraints cannot contain subqueries).
CREATE FUNCTION "overload_array_is_distinct"(anyarray) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT count(*) = count(DISTINCT x) FROM unnest($1) AS t(x) $$;
-- Not callable through the Data API.
REVOKE ALL ON FUNCTION "overload_array_is_distinct"(anyarray) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION "overload_array_is_distinct"(anyarray) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION "overload_array_is_distinct"(anyarray) FROM authenticated; END IF;
END $$;

ALTER TABLE "exercises"
  ADD CONSTRAINT "exercises_name_not_blank"            CHECK (char_length(btrim("name")) > 0),
  ADD CONSTRAINT "exercises_secondary_excludes_primary" CHECK (NOT ("muscle_group" = ANY ("secondary_muscles"))),
  ADD CONSTRAINT "exercises_secondary_distinct"        CHECK ("overload_array_is_distinct"("secondary_muscles")),
  ADD CONSTRAINT "exercises_provenance"                CHECK (("is_custom" AND "source_id" IS NULL) OR (NOT "is_custom" AND "source_id" IS NOT NULL)),
  ADD CONSTRAINT "exercises_custom_has_no_image"       CHECK (NOT "is_custom" OR "image_ref" IS NULL);

ALTER TABLE "gyms" ADD CONSTRAINT "gyms_name_not_blank" CHECK (char_length(btrim("name")) > 0);
```

### Row-Level Security

No table is created by this pitch, so no new `ENABLE ROW LEVEL SECURITY` statement is required; all 11 tables + `_prisma_migrations` keep Foundation's deny-all RLS and zero policies. The migration adds **no policy**. The one new database object reachable by name — the helper function — has `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`. The standing RLS integration test continues to assert "zero public tables without RLS, zero policies".

### Storage

| Item | Value |
| ---- | ----- |
| Bucket | `exercise-images` |
| Posture | **public-read** (standing project resolution; Architecture Open Question "Exercise image bucket" resolved — D15) |
| Contents | imported `free-exercise-db` images only (public domain) |
| Object path | `free-exercise-db/<sourceId>/0.jpg` |
| Writes | only the import/seed path, with `SUPABASE_SERVICE_ROLE_KEY` read from the operator's shell; **no storage policy** grants `anon`/`authenticated` insert/update/delete, so uploads are impossible from the browser |
| Read URL | `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/exercise-images/<imageRef>` |
| Custom exercises | no object, `imageRef` null (DB CHECK) |
| Local stack | bucket declared in `supabase/config.toml` (`[storage.buckets.exercise-images] public = true`, `allowed_mime_types = ["image/jpeg"]`, `file_size_limit = "1MiB"`); the import also creates it if missing |

### Derived Fields

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| Favorites list | no | `isFavorite AND deletedAt IS NULL` | |
| `imageUrl` | no | `imageRef` + public Supabase URL | null when `imageRef` null |
| `primaryMuscleLabel`, `equipmentLabel`, `secondaryMuscleLabels` | no | taxonomy label maps | |
| Result `total` | no | `count` with same filter | |
| progress tag / e1RM | **no, and not in this pitch** | — | untouched |

---

## Source Import (free-exercise-db)

### Source and pinning

- Dataset: `yuhonas/free-exercise-db`, `dist/exercises.json` at commit **`f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`** (2026-09-27), SHA-256 `5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf`, 876 records, public domain (Unlicense).
- The JSON is **vendored** at `prisma/seed/free-exercise-db/exercises.json` (D26) so the import is deterministic, reviewable, and testable offline. The vendored file is never imported by anything under `src/`.
- Images are fetched at import time only, from `https://raw.githubusercontent.com/yuhonas/free-exercise-db/<pinned sha>/exercises/<images[0]>`, and copied into Overload's bucket.

### Observed source values (evidence, pinned snapshot)

| Field | Values (count) |
| ----- | -------------- |
| `primaryMuscles` length | 1 (875), 2 (1: `Kettlebell_Halo_With_Overhead_Extension` = shoulders, triceps) |
| primary values | quadriceps 148, shoulders 129, abdominals 93, chest 84, hamstrings 79, triceps 73, biceps 53, lats 38, middle back 34, calves 28, lower back 27, forearms 25, glutes 22, traps 15, adductors 13, neck 8, abductors 8 |
| secondary values | same 17 labels; 272 records have an empty secondary list |
| secondary contains a primary | 9 records (e.g. `Barbell_Step_Ups`, `Clean_and_Press`) |
| duplicate secondary entries | 0 |
| `equipment` | barbell 170, dumbbell 123, other 122, body only 111, cable 81, **null 77** (62 stretching), machine 67, kettlebells 56, bands 20, medicine ball 17, exercise ball 12, foam roll 11, e-z curl bar 9 |
| `images` | 2 per record (873), **0** (3: `Kettlebell_Halo`, `Kettlebell_Halo_With_Overhead_Extension`, `Kettlebell_Overhead_Triceps_Extension`) |
| `id` | 876 unique; image paths always `<id>/<n>.jpg` |
| `name` | 876 distinct (case/punctuation-insensitive too); max 58 chars |
| `category` | strength 584, stretching 123, plyometrics 61, powerlifting 38, olympic weightlifting 35, strongman 21, cardio 14 (not stored) |

### Muscle mapping (source → canonical)

| Source value | Canonical `MuscleGroup` | Label |
| ------------ | ----------------------- | ----- |
| chest | `chest` | Chest |
| lats | `back` | Back |
| middle back | `back` | Back |
| lower back | `lower_back` | Lower Back |
| traps | `traps` | Traps |
| shoulders | `shoulders` | Shoulders |
| biceps | `biceps` | Biceps |
| triceps | `triceps` | Triceps |
| forearms | `forearms` | Forearms |
| abdominals | `core` | Core |
| quadriceps | `quads` | Quads |
| hamstrings | `hamstrings` | Hamstrings |
| glutes | `glutes` | Glutes |
| calves | `calves` | Calves |
| adductors | `adductors` | Adductors |
| abductors | `abductors` | Abductors |
| neck | `neck` | Neck |

The only merge is `lats` + `middle back` → `back` (the pitch's own examples classify Lat Pulldown and Barbell Row both as Back primary, and swap equivalence must treat them as one group). Everything else is a 1:1 rename. Display order: Chest, Back, Lower Back, Traps, Shoulders, Biceps, Triceps, Forearms, Core, Quads, Hamstrings, Glutes, Calves, Adductors, Abductors, Neck.

### Equipment mapping (source → canonical)

| Source value | Canonical `Equipment` | Label |
| ------------ | --------------------- | ----- |
| barbell | `barbell` | Barbell |
| e-z curl bar | `ez_bar` | EZ bar |
| dumbbell | `dumbbell` | Dumbbell |
| kettlebells | `kettlebell` | Kettlebell |
| cable | `cable` | Cable |
| machine | `machine` | Machine |
| — (no source value) | `plate_loaded` | Plate-loaded machine |
| body only | `bodyweight` | Bodyweight |
| bands | `band` | Band |
| medicine ball | `medicine_ball` | Medicine ball |
| exercise ball | `exercise_ball` | Exercise ball |
| foam roll | `foam_roller` | Foam roller |
| other | `other` | Other |
| `null` | `other` | Other |

`plate_loaded` exists so custom exercises can record what `CLAUDE.md` already distinguishes ("free-weight and plate-loaded exercises have no baseline"); the source does not distinguish plate-loaded from selectorized machines, so **no imported exercise is mapped to it** (no invention). `null` → `other` because the source states no equipment and `other` is the vocabulary's no-claim catch-all.

### Normalization rules (pure function `normalizeSourceExercise`)

1. `primaryMuscle` = mapping of `primaryMuscles[0]`. A record with zero primary muscles is **rejected** (none exist in the pinned snapshot).
2. Additional source primaries (`primaryMuscles[1..]`) are mapped and **prepended to the secondary list** (source-supported fact: the source says the exercise trains that muscle). Affects 1 record.
3. `secondaryMuscles` = mapped source secondaries, in source order, with entries equal to the primary **removed** and duplicates **collapsed** (first occurrence kept). Pinned-snapshot effect: 65 entries removed as equal to primary (mostly lats/middle-back pairs), 6 duplicates collapsed, 277 records end with no secondary muscles (272 had none in the source).
4. `equipmentType` = equipment mapping (null → `other`).
5. `name` = source name, trimmed, otherwise unchanged (no renaming for uniqueness).
6. `sourceId` = source `id`.
7. `imageSourcePath` = `images[0]` or null.
8. Any source muscle/equipment value **not in the mapping throws** (`UnmappedSourceValueError`), aborting the whole run **before any write** — the mapping must be total, never guessed.

No model knowledge, name heuristics, or hand-authored anatomy is used anywhere. Secondary muscles come only from the source lists.

### Import algorithm (`importCatalog`)

```ts
type CatalogImportDeps = {
  prisma: PrismaClient;              // the import process's own client (D28)
  records: SourceExercise[];         // parsed vendored JSON
  imageStore: ExerciseImageStore;    // Supabase Storage adapter in prod; fake in tests
  imageSource: ExerciseImageSource;  // pinned GitHub raw fetcher in prod; fake in tests
  log: (line: string) => void;
};
type CatalogImportReport = {
  sourceRecords: number; inserted: number; alreadyPresent: number;
  imagesUploaded: number; imagesAlreadyStored: number; imagesLinked: number;
  imagesMissingInSource: number; imageFailures: { sourceId: string; reason: string }[];
};
```

1. **Normalize all** records (throws before any write on an unmapped value).
2. **Ensure bucket** `exercise-images` exists and is public (create if missing; if it exists but is private, abort with a clear error — never flip posture silently).
3. **Insert missing exercises**: `prisma.exercise.createMany({ data, skipDuplicates: true })` keyed by the unique `source_id` (`ON CONFLICT DO NOTHING`). Inserted rows: `isCustom=false`, `isFavorite=false`, `deletedAt=null`, `imageRef=null`. **Existing rows are never updated** (D27): no favorite, archive, name, or classification change on rerun.
4. **Images**, for each imported row (`sourceId IS NOT NULL`) whose `imageRef IS NULL` and whose source has an image:
   a. object path `free-exercise-db/<sourceId>/0.jpg`;
   b. if the object already exists in the bucket → do not upload (counts `imagesAlreadyStored`);
   c. else download from the pinned URL and upload with `upsert: false` (a "already exists" race is treated as stored);
   d. on success, `UPDATE exercises SET image_ref = <path> WHERE id = <id> AND image_ref IS NULL AND is_custom = false`;
   e. any failure for that image is recorded in `imageFailures`, leaves `imageRef` null, and the loop continues (the exercise stays fully usable; the UI shows a monogram).
   Concurrency: 6 parallel downloads/uploads.
5. Print the report. Exit 0 if no DB error (image failures are reported, not fatal); exit 1 on normalization/DB/bucket-posture errors.

**Rerun behavior:** a second run inserts 0 rows, uploads 0 objects (all exist), and only links images whose earlier attempt failed. It never touches custom rows (`is_custom = true` rows have `source_id` null and are outside every import predicate), never clears or sets favorites, never unarchives.

### Seed entry point and safety rail

- `prisma.config.ts` → `migrations.seed: "tsx prisma/seed.ts"`; `package.json` script `"db:seed": "prisma db seed"` (and `"import:exercises"` alias).
- `prisma/seed.ts` builds its own `PrismaClient` with the pg adapter on `DATABASE_URL` (a separate CLI process; `src/lib/db.ts` is `server-only` and cannot load in plain Node) and a Supabase **service-role** client from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, both read from the operator's environment. The service-role key is **never** set in Vercel and never referenced under `src/`.
- **Remote-target guard (D29):** if the `DATABASE_URL` host is not `localhost`/`127.0.0.1`, the seed refuses to run unless `OVERLOAD_IMPORT_CONFIRM_HOST` equals that exact host. This protects against the local `.env` pointing at production.

---

## Authorization and Access Control

1. **Authentication in application code.** All five routes live under `(app)`, gated by `requireUser()` in the layout and by `proxy.ts`. Every server action calls `requireUser()` **first**, before parsing input.
2. **RLS deny-all in the database.** Unchanged; no new table, no policy. Storage writes require the service role; there is no storage policy for `anon`/`authenticated`.

```ts
"use server";
export async function archiveExerciseAction(exerciseId: string): Promise<ActionResult<{ id: string }>> {
  await requireUser();                       // re-check inside the action
  return toActionResult(() => archiveExercise({ exerciseId })); // sets deletedAt; never prisma.exercise.delete
}
```

| Resource | Read | Create | Update | Delete |
| -------- | ---- | ------ | ------ | ------ |
| `Exercise` | authenticated (server components) | custom: authenticated action; imported: seed only | `isFavorite` and `deletedAt` only, via write module | **never** (archive) |
| `Gym` | authenticated | authenticated action | `deletedAt` only | **never** (archive) |
| `exercise-images` objects | public URL (public domain assets) | seed (service role) only | never | never |

---

## Server Actions and API Surface

No route handlers. No public API. Reads are server functions called by server components; mutations are server actions → write modules.

### Shared result shape — `src/lib/actions/result.ts`

```ts
type ErrorCode = "validation_error" | "not_found" | "invalid_state_transition" | "unauthorized" | "internal_error";
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: Record<string, string> } };
```

### Reads — `src/lib/exercises/queries.ts` (`server-only`)

```ts
type LibraryView = "all" | "favorites";
type ListExercisesInput = { view?: LibraryView; muscle?: MuscleGroup; search?: string; limit?: number };
listExercises(input): Promise<{ items: ExerciseListItemDto[]; total: number; limit: number;
                                hasAnyActive: boolean; hasAnyFavorites: boolean }>
getExercise(id: string): Promise<ExerciseDetailDto | null>   // resolves archived rows too
parseLibraryParams(searchParams): ListExercisesInput          // tolerant: unknown values → defaults
```

Query (all composable, AND-ed):

```ts
where: {
  deletedAt: null,                                   // always for selection
  ...(view === "favorites" ? { isFavorite: true } : {}),
  ...(muscle ? { primaryMuscle: muscle } : {}),      // primary only — secondaries never consulted
  AND: tokens(search).map((t) => ({ name: { contains: t, mode: "insensitive" } })),
},
orderBy: [{ name: "asc" }, { id: "asc" }],
take: limit,                                          // default 50, max 1000
```

`tokens(search)`: trim, collapse whitespace, split, max 8 tokens, each ≤ 50 chars. Empty → no name filter.

### Reads — `src/lib/gyms/queries.ts`

```ts
listActiveGyms(): Promise<GymListItemDto[]>   // deletedAt: null, orderBy [name asc, createdAt asc]
```

### Writes — `src/lib/exercises/exercises.ts` (the only module that writes `Exercise` outside the seed)

```ts
createCustomExercise(input: CustomExerciseInput, tx?): Promise<Exercise>
  // isCustom true, sourceId null, imageRef null, isFavorite false
setExerciseFavorite({ exerciseId, isFavorite }, tx?): Promise<Exercise>
  // not_found if missing; invalid_state_transition if archived
archiveExercise({ exerciseId }, tx?): Promise<Exercise>
  // sets deletedAt = now() if null; idempotent; never deletes; never touches isFavorite
restoreExercise({ exerciseId }, tx?): Promise<Exercise>
  // clears deletedAt (Undo only)
```

### Writes — `src/lib/gyms/gyms.ts`

```ts
createGym({ name, address? }, tx?): Promise<Gym>   // creates ONLY a Gym row — no baseline
archiveGym({ gymId }, tx?): Promise<Gym>
restoreGym({ gymId }, tx?): Promise<Gym>
```

Write functions throw typed `DomainError(code, message, details?)`; actions convert via `toActionResult`, mapping unknown errors to `internal_error` with a generic message (no Prisma text leaks).

### Server actions

| Action | File | Input | Output | Side effects |
| ------ | ---- | ----- | ------ | ------------ |
| `setExerciseFavoriteAction` | `src/app/(app)/exercises/actions.ts` | `(exerciseId, isFavorite)` | `ActionResult<{ id; isFavorite }>` | update `is_favorite`; `revalidatePath("/exercises")` |
| `createCustomExerciseAction` | same | `(prevState, FormData)` | `ActionResult<{ id }>` (on success `redirect("/exercises/<id>?created=1")`) | insert |
| `archiveExerciseAction` | same | `(exerciseId)` | `ActionResult<{ id }>` | set `deleted_at` |
| `restoreExerciseAction` | same | `(exerciseId)` | `ActionResult<{ id }>` | clear `deleted_at` |
| `createGymAction` | `src/app/(app)/gyms/actions.ts` | `(prevState, FormData)` | `ActionResult<{ id }>` (on success `redirect("/gyms?created=1")`) | insert gym only |
| `archiveGymAction` | same | `(gymId)` | `ActionResult<{ id }>` | set `deleted_at` |
| `restoreGymAction` | same | `(gymId)` | `ActionResult<{ id }>` | clear `deleted_at` |

The `created=1` param lets the destination page show the success toast once (a tiny client effect strips the param via `router.replace`).

---

## Validation Rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| exercise `name` | string; trimmed length 1–100 | `validation_error` `details.name` |
| `primaryMuscle` | one of 16 `MuscleGroup` values | `validation_error` `details.primaryMuscle` |
| `equipmentType` | one of 13 `Equipment` values | `validation_error` `details.equipmentType` |
| `secondaryMuscles` | each a `MuscleGroup`; no duplicates; none equal to primary; ≤ 15 | `validation_error` `details.secondaryMuscles` |
| any image/upload field | **not accepted** — the parser ignores unknown keys; there is no image parameter | — |
| `exerciseId` / `gymId` | UUID format | `not_found` if malformed or missing |
| gym `name` | trimmed length 1–80 | `validation_error` `details.name` |
| gym `address` | optional; trimmed ≤ 200; empty → null | `validation_error` `details.address` |

Server never accepts client-supplied `deletedAt`, `isCustom`, `sourceId`, `imageRef`, or `isFavorite` on create. The DB CHECK constraints are a second layer for primary/secondary, provenance, custom-has-no-image, and non-blank names.

---

## UI Data Contracts

```ts
type ExerciseListItemDto = {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  primaryMuscleLabel: string;
  equipmentLabel: string;
  isCustom: boolean;
  isFavorite: boolean;
  imageUrl: string | null;
};

type ExerciseDetailDto = ExerciseListItemDto & {
  equipmentType: Equipment;
  secondaryMuscleLabels: string[];   // display order = stored order
  isArchived: boolean;
};

type GymListItemDto = { id: string; name: string; address: string | null };
```

No DTO exposes `sourceId`, timestamps, or Storage credentials. Gym `address` appears only in `GymListItemDto`.

---

## Testing Strategy

Runner: Jest (unit) + Jest integration against the embedded throwaway Postgres (Foundation D16) + Playwright (unauthenticated boundary only; authenticated flows cannot run without a real Supabase Auth stack — see D38). Lean where CRUD; adversarial for archival/history.

### 1. Happy path

```text
TEST: import_inserts_normalized_catalog
GIVEN: empty exercises table; fake image store/source; fixture of real source records
WHEN: importCatalog runs
THEN: one row per record; primary/secondary/equipment per mapping; isCustom false; isFavorite false; imageRef set for records with images

TEST: create_custom_exercise
WHEN: createCustomExercise({ name:"Landmine Press", primaryMuscle:"shoulders", equipmentType:"barbell", secondaryMuscles:["triceps"] })
THEN: isCustom true, sourceId null, imageRef null, appears in listExercises({muscle:"shoulders"})

TEST: create_gym_without_address
WHEN: createGym({ name:"Home Garage" })
THEN: address null; listed; gym_exercise_baselines count unchanged (0)
```

### 2. Validation

```text
custom requires name / primary / equipment (each missing → validation_error with details key)
secondary equal to primary → validation_error; DB CHECK also rejects a direct insert
duplicate secondary → validation_error; DB CHECK also rejects a direct insert
unknown enum value → validation_error
gym requires name; blank/whitespace name rejected (app + DB CHECK)
```

### 3. State transitions

```text
archive_exercise_sets_deleted_at_only (isFavorite unchanged, row still present)
archive_is_idempotent; restore clears deletedAt; favorite on archived → invalid_state_transition
archive_gym / restore_gym analogous
```

### 4. Side effects

```text
creating a gym creates no GymExerciseBaseline
favoriting changes only is_favorite
import never writes is_favorite, deleted_at, or custom rows
```

### 5. Security / privacy

```text
RLS: still zero public tables without RLS; zero policies (standing test)
anon cannot EXECUTE overload_array_is_distinct
every server action calls requireUser() before doing anything (unit, mocked auth → redirect, write module not called)
no file under src/ references SUPABASE_SERVICE_ROLE_KEY / service_role / createClient with a service key
no NEXT_PUBLIC_ secret (standing); client-bundle guard (standing)
custom exercise form/action has no file input / image parameter (static + unit)
unauthenticated GET /exercises, /exercises/new, /gyms, /gyms/new → /login (Playwright)
```

### 6. Edge cases

```text
Favorites with none starred → hasAnyFavorites false (drives the right empty state)
search with %, _ or quotes is treated literally
duplicate exercise names (custom vs imported, custom vs custom) both listed; duplicate gym names allowed
image failure for one record → that row imageRef null, others linked, report lists the failure, exercise listable
record with no source image → imageRef null, counted imagesMissingInSource
multi-primary source record → first primary, second demoted to secondary
```

### 7. Integration scenarios (required by the run instruction)

| Requirement | Test |
| ----------- | ---- |
| library reads local data, not the source at runtime | static scan: no `src/` file references `free-exercise-db`, `raw.githubusercontent`, `yuhonas`, or the vendored JSON; `listExercises` returns rows inserted directly into the DB |
| rerun doesn't duplicate exercises | `importCatalog` twice → same row count, second report `inserted: 0` |
| rerun doesn't duplicate images | second run → `imagesUploaded: 0`, fake store object count unchanged; existing objects skipped |
| identity isn't name-based | two source records with the **same name** and different ids both imported; a pre-existing custom with a source name is not matched |
| import doesn't overwrite similar custom | custom "Barbell Squat" exists → after import it is unchanged (name, classification, isCustom, favorite) and a separate imported row exists |
| exactly one primary for every active exercise | normalization over the **entire** vendored dataset yields exactly one canonical primary per record; DB: `muscle_group` NOT NULL enum |
| secondary optional | custom with none; imported records with none |
| primary not in secondary; no duplicate secondaries | normalization over full dataset + DB CHECK tests |
| Back filter excludes secondary-Back | exercise primary biceps, secondary back → not in `muscle: back` |
| secondary only from source | normalized secondaries ⊆ mapped source primaries[1..] ∪ secondaries for every record |
| favorite/unfavorite persists (imported & custom) | write then re-read |
| Favorites + muscle; Favorites + search; Favorites + muscle + search | composition matrix |
| archived not in Favorites | favorite + archive → absent from favorites; `isFavorite` still true |
| import doesn't clear/manufacture favorites | favorite an imported row, rerun import → still favorite; all new rows false |
| custom has no image | DB CHECK + create path |
| archived exercise/gym excluded from active selection; not hard-deleted | listExercises/listActiveGyms + row still exists |
| history readable after archiving exercise / gym | seed a LoggedSession→LoggedExercise (exercise+gym) via test Prisma, archive both via write modules, read LoggedExercise with `include: { exercise, gym }` → both resolve with names |
| Restrict still blocks hard deletes | standing test |

### 8. UI behavior

Unit tests for pure helpers (`parseLibraryParams`, `monogram`, label maps, filter-summary text). Manual phone-width verification of the rendered pages is **not possible in this run** without a real Auth backend (D38); recorded in the runbook as a production verification step.

### 9. Regression / deliberate absences (static guards in `tests/unit/`)

No source under `src/` contains: a `LoggedSession`/`LoggedExercise`/`LoggedSet` write; any `gymExerciseBaseline` write; `isGymVariable`; mesocycle/session/sessionExercise writes; progression/e1RM functions; swap actions; geocoding/maps packages or `navigator.geolocation`; `recentlyUsed`/`recommend`/auto-favorite code; `type="file"` inputs or Storage `.upload(` calls. `package.json` contains no maps/geocoding dependency.

---

## Acceptance Criteria

### Catalog import
- [ ] The pinned `free-exercise-db` snapshot is vendored and imported by `npm run db:seed`; 876 imported exercises after a first run against an empty DB.
- [ ] Every imported exercise has exactly one canonical primary muscle and one canonical equipment type; secondaries obey the mapping and rules above.
- [ ] Images are copied into the public `exercise-images` bucket; the app renders them from Overload's Storage, never from the source.
- [ ] Rerunning inserts no rows, uploads no duplicate objects, and does not change favorites, archive state, or custom exercises.
- [ ] An image failure leaves the exercise usable (monogram fallback) and is reported.

### Exercise Library
- [ ] All/Favorites × primary muscle × name search compose; Back never includes secondary-only Back.
- [ ] Favorite/unfavorite persists for imported and custom exercises.
- [ ] Custom creation requires name, primary muscle, equipment; secondaries optional; no image path exists.
- [ ] Archived exercises vanish from All and Favorites, keep their row/identity, and resolve by id; Undo restores.
- [ ] Empty, no-match, favorites-empty, catalog-not-imported, loading, and error states render per the design doc.

### Gym Management
- [ ] Gym requires a name; location optional free text; duplicate names allowed.
- [ ] Creating a gym creates no baseline.
- [ ] Archiving hides the gym from the list, keeps the row; Undo restores.
- [ ] No map, geocoding, or location API is introduced.

### Invariants
- [ ] No hard delete path for `Exercise`/`Gym`; history references resolve after archival.
- [ ] RLS deny-all unchanged; no policies; helper function not executable by `anon`.
- [ ] Service-role key used only by the seed process; never in `src/` or client bundles.
- [ ] Unauthenticated access to the new routes redirects to `/login`.

---

## Explicit Non-Goals

- ❌ Program/mesocycle generation; Favorites never become a recommended program. **Permanent.**
- ❌ Social/shared favorites. **Permanent.**
- ❌ Cardio progression. **Permanent.** ❌ Nutrition/body composition. **Permanent (this build).**
- ❌ Gym baselines, `isGymVariable`, working weights. **Deferred** to Guided Workout Logging.
- ❌ Exercise Swap (will match on `primaryMuscle` only). **Deferred** to Guided Workout Logging.
- ❌ Location-pinned gyms, maps, arrival notifications. **Deferred** to the mobile phase.
- ❌ Custom exercise editing, notes, gym editing, archived-items screen. **Deferred** pending upstream amendment.
- ❌ Recently used / recommendations / auto-favorite. **Not planned.**

---

## Resolved Decisions

Decisions **D1–D19** are the pre-resolved decisions supplied in the Library & Gyms Setup pipeline instruction ("Pre-resolved decisions" §1–§19). Per that instruction they are approved doc authority: recorded here, not re-opened. Decisions **D20+** were resolved autonomously under the authority order (`CLAUDE.md` > approved planning docs (as amended by the pitch and the pre-resolved decisions) > design doc > this spec), with rationale.

| # | Decision | Source / rationale |
| - | -------- | ------------------ |
| D1 | Favorites are a manual, persistent, exercise-level property (`Exercise.isFavorite`), global, for imported and custom; favoriting adds nothing to a plan; no automatic favoriting. | Pre-resolved §1. A boolean column is the simplest persistent exercise-level property; no new table → no new RLS surface. |
| D2 | Scope (All/Favorites), primary-muscle filter, and name search compose (AND); not separate search experiences. | Pre-resolved §2. |
| D3 | Every Exercise has exactly one primary muscle (`muscle_group` NOT NULL enum); primary governs library filtering and future Exercise Swap. | Pre-resolved §3. |
| D4 | Secondary muscles optional metadata only (`MuscleGroup[]`), no product logic; no duplicates; never the primary — enforced in app and DB. | Pre-resolved §4. |
| D5 | No invented anatomy: imported secondaries come only from source lists (plus the source's own extra primary); empty source → empty set. | Pre-resolved §5. |
| D6 | One canonical muscle vocabulary (16 values) derived from the real source values (mapping table above); written to `docs/planning/method-note.md`. | Pre-resolved §6; evidence: pinned snapshot analysis. |
| D7 | Custom exercise requires name + primary + equipment; optional secondaries; no image; participates in all library behavior identically. | Pre-resolved §7. |
| D8 | One canonical equipment vocabulary (13 values) from real source values; mapping in `method-note.md`; no gym-variable decision made. | Pre-resolved §8. |
| D9 | Exercise and Gym names are not unique; identity is the row. UI disambiguates with primary·equipment, Custom badge, and gym location. | Pre-resolved §9. |
| D10 | Archival never hard-deletes; archived rows excluded from selection, retain identity, resolve for history. | Pre-resolved §10. |
| D11 | Archived exercises drop out of Favorites by query; archival does **not** clear `isFavorite`. | Pre-resolved §11 (resolves the pitch's "clear vs invisible" edge case: invisible). |
| D12 | Custom exercise editing and notes are out of scope; recorded as a required upstream amendment. | Pre-resolved §12. |
| D13 | Gym location is optional free text (`address`), no maps/geocoding/coordinates. | Pre-resolved §13. |
| D14 | `free-exercise-db` is import-only; the app never fetches it at runtime. | Pre-resolved §14. |
| D15 | Exercise-image bucket is **public-read**, written only by the import with the server-only service-role credential; no user uploads. Resolves Architecture Open Question "Exercise image bucket". | Pre-resolved §15 (standing project resolution). |
| D16 | The import is safe to rerun: identity by stable `sourceId` (unique), not display name; existing image objects are not re-uploaded; custom rows never overwritten. | Pre-resolved §16. |
| D17 | Import never favorites, clears favorites, converts custom↔imported, unarchives, creates plans, or creates history. | Pre-resolved §17. |
| D18 | No gym/exercise working-weight state is created in this pitch. | Pre-resolved §18. |
| D19 | No program-generation behavior enters through the library. | Pre-resolved §19. |
| D20 | **Storage of vocabularies as Postgres enums** (`MuscleGroup`, `Equipment`) via Prisma enums, converting the existing `muscle_group`/`equipment_type` text columns **in place** with `ALTER COLUMN … TYPE … USING` in a hand-written migration. | DB-level guarantee of "exactly one primary from the vocabulary"; Prisma's auto-diff would DROP+ADD the columns (destructive, stop condition 4), so the SQL is hand-written; the cast fails loudly instead of losing data. Column names are kept (no rename) and the Prisma field becomes `primaryMuscle @map("muscle_group")`. |
| D21 | **Merge `lats` + `middle back` → `back`; keep `lower back` as `lower_back`; rename `abdominals`→`core`, `quadriceps`→`quads`.** | Pitch examples classify Lat Pulldown (source: lats) and Barbell Row (source: middle back) both as "Back", and swap equivalence must group them. Lower back (deadlifts, hyperextensions) is a distinct training target and not a pulldown/row substitute; merging it would lose source information and broaden swaps. Renames follow the pitch's own vocabulary. |
| D22 | **`null` equipment → `other`; add `plate_loaded` (custom-only).** | `other` makes no claim (77 null records, mostly stretches); `plate_loaded` preserves the free-weight/plate-loaded distinction `CLAUDE.md` already relies on for custom exercises, while no imported record is guessed into it. |
| D23 | **Multi-primary source record** (`Kettlebell_Halo_With_Overhead_Extension`: shoulders, triceps) → primary = first listed; others become secondary. | Exactly-one-primary rule; the source itself asserts both muscles, so nothing is invented. |
| D24 | **Import all 876 records** (all categories, including stretching/cardio/plyometrics); `category`, `level`, `force`, `mechanic`, `instructions` are not stored. | "The catalog has been imported"; curating categories would be an unrequested product decision. The lifter can archive what he doesn't want. No schema exists for the extra fields and none was approved. |
| D25 | **One image per imported exercise** (`images[0]`, the start position) stored at `free-exercise-db/<sourceId>/0.jpg`; `imageRef` holds the object path. | The Architecture data model has a single "image reference"; halves storage/import time; enough to recognize the movement. |
| D26 | **Vendor the pinned dataset JSON** in `prisma/seed/free-exercise-db/exercises.json` (commit `f00c92c…`, SHA-256 `5bb747e3…`); fetch images from the pinned commit at import time. | Deterministic, reviewable, offline-testable import (full-dataset normalization test); "if it disappears tomorrow, nothing breaks" for already-imported data. Images (~33 MB) are not vendored. |
| D27 | **Import never updates existing rows** (insert-missing + link-missing-images only). | Strongest guarantee for D16/D17; mapping changes later go through a reviewed migration, not a silent re-import. |
| D28 | **Seed runs as its own process with its own `PrismaClient`** (pg adapter, `DATABASE_URL`), via `tsx`. `tsx` is added as a **devDependency** (flagged). | `src/lib/db.ts` is `server-only` and cannot load outside Next; "one client per process" holds (the seed is a separate CLI process). Node 22.15 cannot run TS with path aliases natively; `tsx` is a dev-only runner with no runtime footprint. |
| D29 | **Remote-target guard**: the seed refuses a non-local `DATABASE_URL` unless `OVERLOAD_IMPORT_CONFIRM_HOST` equals its host. | The repo's local `.env` was found to contain production values; an accidental `npm run db:seed` must not touch production. |
| D30 | **Archive UX: confirm dialog + Undo toast; Undo is the only unarchive.** | Repo convention (design-doc skill + api-conventions: archiving "should return enough for the UI to offer undo") satisfies Pre-resolved §11's "unless already supported by a standing repository convention"; since no archive-management screen exists, a short specific confirmation prevents a mis-tap from being unrecoverable after the toast expires. |
| D31 | **Library filter state in URL search params**; server-rendered list; page size 50 with "Show 50 more" (`limit`, max 1000). | Shareable back/forward state, no client data fetching (CLAUDE.md data-access rule); bounded phone payload. |
| D32 | **Name search = every whitespace-separated token must appear (case-insensitive, any order)**, name only. | "press bench" finds "Barbell Bench Press"; cheap with `contains`. Search is names-only per api-conventions. |
| D33 | **Plain `<img loading="lazy">` for exercise images** (no `next/image`). | Source JPEGs are small (~40 KB); avoids Vercel image-optimization configuration for a local vs prod Supabase host and Next 16's local-IP block; lazy loading bounds bandwidth. |
| D34 | **Toasts via shadcn/ui `sonner`** (flagged dependency), themed `system` without `next-themes`. | Design-doc convention mandates Sonner; it is shadcn/ui's toast component, not a second component system. |
| D35 | **Nav gains "Exercises" and "Gyms"** as top-level items (no Plan/Settings placeholders). | Foundation's "one honest destination" principle; re-homing later is a nav change only. |
| D36 | **Repo hygiene fixed in the first ticket**: add `.gitattributes` (`eol=lf`), restore a committed `.env.example` (and un-ignore it), sync `package-lock.json`. | Required for the standing suite to be green on a fresh checkout: Prettier failed on CRLF checkouts, the Foundation unit test reads `.env.example` which was git-ignored and absent, and `npm ci` rejected the lockfile. No behavior change. |
| D37 | **Foundation "no seed script" guard is replaced** with "the seed only imports catalog data": no migration contains `INSERT`; the seed module writes only `Exercise` (and Storage); it never writes logged-history, plan, baseline, goal, or cardio models. | Pitch 2 is the pitch that introduces the seed (CLAUDE.md: "imported once by a Prisma seed script"); the Foundation guard's intent (no demo/training data) is preserved and strengthened. |
| D38 | **Authenticated E2E is not run**; Playwright covers the unauthenticated boundary of the new routes, and logic is covered by integration tests. | No Supabase Auth backend is available in this environment (Docker down, no local stack, production off-limits); the runbook adds manual verification steps. |
| D39 | **Validation limits**: exercise name ≤ 100, gym name ≤ 80, address ≤ 200, ≤ 15 secondaries, search ≤ 8 tokens × 50 chars. | Generous bounds above the dataset's 58-char max name; prevents pathological input. |

---

## Open Questions

None blocking. Carried forward / upstream:

1. **Upstream amendment (required):** custom exercise editing and notes (PRD journey) vs roadmap/architecture — not built (D12).
2. **Upstream amendments (required):** Favorites; primary/secondary model; custom classification; free-text gym location; Architecture Exercise model (fields `primaryMuscle`, `secondaryMuscles`, `sourceId`, `isFavorite`; enums). Listed in the run report.
3. **For Guided Workout Logging (not this pitch):** which `Equipment` values are gym-variable; note that imported `machine` includes plate-loaded machines indistinguishably (see method note).
4. **For a later pitch:** an archived-items view/unarchive outside Undo, if wanted.

---

## Future Considerations

- Pitch 3's exercise picker reuses `listExercises` (+ `LibraryControls`, `FavoriteButton`, `ExerciseThumb`) and must filter `deletedAt: null` (already the default).
- Pitch 4's Exercise Swap filters candidates with `primaryMuscle = planned.primaryMuscle AND deletedAt IS NULL` — the vocabulary and index exist now.
- Pitch 4's `isGymVariable(exercise)` reads `equipmentType` only; no name parsing is needed.
- History views must read `Exercise`/`Gym` **without** a `deletedAt` filter (`getExercise` already resolves archived rows).
- `Gym` can later gain pinned location fields for the mobile phase without touching history.

---

## Ticket Breakdown (build order)

1. **Library & Gyms data model: canonical vocabularies, Exercise classification migration, repo hygiene** — taxonomy module, enums, hand-written migration + CHECKs + function revoke, Foundation test updates, constraint integration tests, D36.
2. **free-exercise-db catalog import** — vendored snapshot, normalization/mapping, idempotent DB + image import, seed CLI + guard, `tsx`, `method-note.md`, import tests, D37 guard update, local bucket config.
3. **Exercise Library data layer & server actions** — queries, write module, validation, actions with auth, composition/archival/history integration tests.
4. **Exercise Library UI** — nav, library list + controls + states, detail, custom create form, archive dialog + Undo, image fallback, Sonner, Playwright boundary tests.
5. **Gym Management + deliberate-absence guards** — gyms module, actions, list/create/archive UI, no-baseline + history tests, static absence guards.
