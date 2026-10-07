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
