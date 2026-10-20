# Overload — Method Note

Durable method decisions that later pitches depend on. Each entry names the pitch that established it. Changing an entry requires a reviewed migration and an update here.

---

## Exercise classification vocabulary (established by Library & Gyms Setup)

Source: `docs/specs/02-library-gyms-setup-spec.md` (D6, D8, D20–D23). Code: `src/lib/exercises/taxonomy.ts` (labels, order) and the Prisma enums `MuscleGroup` / `Equipment`; source mapping in `prisma/seed/free-exercise-db/normalize.ts`.

There is **one** muscle vocabulary and **one** equipment vocabulary, used by imported exercises, custom exercises, the library filter, and every later feature (Exercise Swap, gym-variable rules). Do not create a parallel taxonomy.

### Primary vs secondary

- Every exercise has exactly **one primary muscle**. It is the exercise's training intent and the **only** muscle classification that participates in product logic: the library muscle filter, and Exercise Swap equivalence (Guided Workout Logging must match candidates on `primaryMuscle` only).
- **Secondary muscles** are optional, distinct, never equal to the primary, and **descriptive only**. They must not drive filtering, swaps, volume, fatigue, recommendations, or progression unless a future pitch explicitly changes that.

### Canonical muscle groups (16)

Display order: Chest, Back, Lower Back, Traps, Shoulders, Biceps, Triceps, Forearms, Core, Quads, Hamstrings, Glutes, Calves, Adductors, Abductors, Neck.

| free-exercise-db value | Canonical (`MuscleGroup`) |
| ---------------------- | ------------------------- |
| chest | `chest` |
| lats | `back` |
| middle back | `back` |
| lower back | `lower_back` |
| traps | `traps` |
| shoulders | `shoulders` |
| biceps | `biceps` |
| triceps | `triceps` |
| forearms | `forearms` |
| abdominals | `core` |
| quadriceps | `quads` |
| hamstrings | `hamstrings` |
| glutes | `glutes` |
| calves | `calves` |
| adductors | `adductors` |
| abductors | `abductors` |
| neck | `neck` |

Consequence for Exercise Swap: lat- and row-dominant movements share `back` and are mutual swap candidates; lower-back movements (deadlift, hyperextension, good morning) are a separate `lower_back` group.

### Canonical equipment (13)

| free-exercise-db value | Canonical (`Equipment`) | Notes for Guided Workout Logging |
| ---------------------- | ----------------------- | -------------------------------- |
| barbell | `barbell` | free weight |
| e-z curl bar | `ez_bar` | free weight |
| dumbbell | `dumbbell` | free weight |
| kettlebells | `kettlebell` | free weight |
| cable | `cable` | cable stack — candidate gym-variable |
| machine | `machine` | **mixed**: the source does not distinguish selectorized from plate-loaded machines (e.g. Leg Press is `machine`) |
| — | `plate_loaded` | no source value maps here; only custom exercises use it |
| body only | `bodyweight` | |
| bands | `band` | |
| medicine ball | `medicine_ball` | |
| exercise ball | `exercise_ball` | |
| foam roll | `foam_roller` | |
| other | `other` | catch-all, no claim |
| *(null)* | `other` | 77 records, mostly stretches |

Guided Workout Logging owns `isGymVariable(exercise)` and must decide it from `equipmentType` alone (no name parsing). The only open judgment it inherits: imported `machine` records include plate-loaded machines it cannot tell apart; the lifter can classify custom exercises precisely with `plate_loaded`.

### Normalization rules for imported records

1. Primary = mapped `primaryMuscles[0]`; any further source primaries become secondaries (one record in the pinned snapshot).
2. Secondaries = mapped source secondaries, in source order, minus the primary, de-duplicated.
3. No secondary muscle is ever added that the source did not list. Records whose source secondary list is empty keep an empty set.
4. An unmapped source value aborts the import before any write.

Pinned source: `yuhonas/free-exercise-db` commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`, 876 records.

---

## Gym-variable classification and baselines (established by Guided Workout Logging)

Source: `docs/specs/04-guided-workout-logging-spec.md` (Resolved Decisions 40–48). Code: `src/lib/exercises/gym-variable.ts` (`isGymVariable`), `src/lib/gyms/baselines.ts` (median + threshold + establish/correct).

- **`isGymVariable(exercise)`** is the single authority. It returns `true` **iff** `equipmentType ∈ { machine, cable }`, decided from `equipmentType` alone — never by name. Both values are verified canonical members of the `Equipment` enum / `EQUIPMENT_TYPES`.
- `plate_loaded` is **gym-consistent** (not gym-variable): a plate-loaded machine's resistance is the plates, so it does not vary by gym. Only custom exercises carry `plate_loaded`; imported `machine` records that are physically plate-loaded cannot be told apart from the source and are treated as gym-variable (a known, accepted imprecision the lifter can avoid by creating `plate_loaded` custom exercises).
- Only gym-variable exercises get a `GymExerciseBaseline` row; free-weight/plate-consistent exercises get **none** (no zero placeholders).
- **Representative session weight** = the **median** of a completed `LoggedExercise`'s planned-working-set weights (`100,100,110,110 → 105`). Not first/max/mean/latest.
- **Baseline establish/correct** happens at exercise completion, in the same transaction as the completing set write, scoped to `(gymId, exerciseId)` only, never rewriting any `LoggedSet`. First completed collection **establishes** (not a correction).
- **Correction threshold:** `BASELINE_CORRECTION_THRESHOLD_PERCENT = 15` — correct iff `|median − baseline| × 100 ≥ baseline × 15` (float-safe Decimal math). This is a **tunable Bucket C default**, not PRD-derived; expected to be re-tuned from lived data (the Architecture Doc's identified top technical risk).
- Historical set edits do **not** replay baselines; the stored baseline remains the latest value established/corrected by live logging.

## New data objects (established by Guided Workout Logging)

Source: `docs/specs/04-guided-workout-logging-spec.md` §8. These extend the Architecture Data Model (which predates them); recorded here per the run's amendment 9/10.

- **`LoggedSessionStatus { in_progress, complete }`** — explicit completion state on `LoggedSession`; never inferred. `completedAt` is its timestamp.
- **`LoggedSession.scheduledFor` (DATE)** — the authored calendar date of the planned occurrence; the idempotency key `(sessionId, scheduledFor)` so opening/resuming never duplicates a session.
- **`LoggedExercise` plan-context snapshot** — `plannedExerciseId`, `sessionExerciseId` (SetNull), `plannedSets`, `targetRepMin`, `targetRepMax`: durable plan provenance so later plan edits can't make old history unintelligible. `exerciseId` is the **performed** exercise (changes on swap); `plannedExerciseId` is immutable.
- **`MissedDayResolution { mesocycleId, sessionId?, missedOn (DATE), outcome }`**, `outcome ∈ MissedDayOutcome { logged_late, shifted, skipped }`, unique `(mesocycleId, missedOn)`, immutable in Pitch 4, RLS deny-all. The effective training schedule is derived from the authored `Mesocycle` plus these records; the template is never mutated. Shifts are computed **per mesocycle week independently** (current-week scope; a shifted occurrence beyond the week is dropped, never carried forward).

## Release-note content contract (established by What's New)

Source: `docs/specs/12-whats-new-spec.md` §8 "Release-note content contract" (Resolved Decisions R5–R12). Code: `src/lib/release-notes/entries.ts` (the only place entries live), `types.ts` (`ReleaseNoteEntry`), `catalog.ts` (validation, order, formatting, selection), `seen.ts` (per-account `ReleaseSeen`, server-only). Consumed by `overload-onboarding` from Faster Logging UX (Pitch 13) onward.

- **Entry fields:** `id` (permanent kebab-case slug that starts with its own date, `YYYY-MM-DD-short-name`, ≤ 64, unique, never reused or changed), `date` (shipping date `YYYY-MM-DD`, never planned or backdated), `title` (1–80 chars, one line), `body` (1–400 chars, one to three plain sentences, no HTML or Markdown links), `significant` (boolean: may open the What's New dialog).
- **Adding one:** put a new object at the **top** of `RELEASE_NOTES`, dated the day it reaches production. Nothing else changes (no component, page, action, migration, or test edit). CI validates the file.
- **Order:** file order, newest first, validated non-increasing by date; same-date entries keep file order (upper = newer).
- **Never** delete, re-order, or re-date a published entry, or change its `id` (each account's seen point refers to it). Correct wording mistakes in place only.
- **Seen state:** `ReleaseSeen` (one row per account) stores the newest entry shown. A new account starts at the newest entry; an account with no row has been shown nothing; an entry dated before an account's creation (its calendar date in the account's timezone) is never unseen. The dialog opens only on a full page load, never mid-visit. The dialog marks seen when it opens.
- **No tour link field** exists (R20). The launch catalog is empty (R8).
