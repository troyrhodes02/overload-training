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

## Set entry and tap-count method (established by Faster Logging UX)

Source: `docs/specs/13-faster-logging-ux-spec.md` (§5, §7, §11, §14.4; Resolved Decisions R4–R13, R21–R22, R26). Code: `src/lib/logging/set-entry.ts` (active set, offer, context line), `src/components/logging/exercise-card.tsx`, `src/lib/logging/queries.ts` (`previousPerformance`, gym-scoped working weight). Consumed by RIR Logging & Autoregulation ("logging speed is not meaningfully slower") and any later change to the logging card.

### Set-entry rules

- **One active row.** Only the lowest unlogged planned set (or the pending extra after Add set) has inputs. Logged sets render as text from the server's records only ("a box is a draft; a plain number is history"). Upcoming sets are read-only.
- **The weight carries; reps are never offered.** Set 1 offers the working weight; later sets offer the weight of the highest-numbered logged set in the card. An offer is local state: nothing is written until Log set or Enter in reps. The +5 Progress and 90% deload suggestions never prefill. Bodyweight has no weight field and no offer.
- **Working weight is gym-scoped for machine/cable** (`isGymVariable`): the gym's baseline, else the latest weight logged at that gym, else none — never another gym's. Gym-consistent: the latest weight logged anywhere. One source feeds the offer and the display-only suggestions.
- **"Last time"** = the most recent earlier `LoggedExercise` of the performed exercise with ≥ 1 set, on or before the workout's date; machine/cable at this gym only.
- **Focus only follows the lifter's action**: none on load; next reps after a confirmed set; Next/Finish after the last planned set; the new card's set after Next/Previous. Log set does not take focus.
- A new control on the card (for example an RIR selector) belongs on the active row only, so logged and upcoming rows stay control-free.

### Tap-count method

- **Representative workout** (`e2e/accounts/support/representative-workout.ts`): Push Day 1 at Downtown Gym, week 2 of a 5-week block — Barbell Bench Press - Medium Grip 3 × 6–8 (history 185 × 8, 8, 7; today the same), Incline Dumbbell Press 3 × 8–10 (history 60 × 10, 10, 9; today 65 × 9, 8, 8), Triceps Pushdown (cable) 3 × 10–12 (history 50 × 12, 12, 11 and a Downtown baseline of 50; today the same), Pushups (bodyweight) 2 × 12–20 (history 18, 15; today 18, 16).
- **Counted** from the open workout page to the dashboard after Finish, in a 375×812 touch context: a **tap** is one pointer activation on a page element (including tapping a field to focus it; a field the app already focused is not tapped); a **keystroke** is one key. Drivers act only through the counter (no `fill`, `focus`, or script). Replacing a value on a card without select-on-focus costs a tap, an uncounted `End`, one Backspace per character, and the digits.
- **Results:** Pitch 4 card (`fe34d00`) **29 taps, 28 keystrokes, 12 visible controls** (3-set card with set 1 logged, plus Previous/Next); Faster Logging UX card **18 taps, 18 keystrokes, 8 controls**. Before: `OVERLOAD_TAP_BASELINE=1` run of `e2e/accounts/tap-count-baseline.spec.ts` from a worktree of `fe34d00`. After: `e2e/accounts/faster-logging.spec.ts` (asserts ≤ 18 and < 29).
- **Limit:** desktop Chrome with touch emulation does not reproduce iOS Safari's keyboard. If iOS drops the keyboard between sets, each set the app focuses costs one extra tap (nine in this workout), so the iOS after-count is at most 27. A later pitch measures the same way and states the same caveat.

## RIR scale and progression qualifiers (established by RIR Logging & Autoregulation)

Source: `docs/specs/14-rir-logging-autoregulation-spec.md` (§5, §6, §11; Resolved Decisions R3–R16, R25, R30). Code: `src/lib/logging/rir.ts` (scale, formatters), `src/lib/logging/logged-sets.ts` (the only writer), `src/lib/progression/config.ts` (`RIR_AT_LIMIT`, `RIR_TO_SPARE_MIN`), `src/lib/progression/engine.ts` (`evaluateReactiveDecision`), `src/lib/progression/rir-copy.ts` (reason lines). Consumed by Smarter & Explainable Progression (evidence lines) and Exercise History & PR Intelligence.

### The stored fact

- **`LoggedSet.rir`** (nullable integer, `CHECK rir IS NULL OR rir BETWEEN 0 AND 4`, migration `9f_logged_set_rir`). `NULL` = not recorded — never 0, never inferred or backfilled. `0` = no rep left; `4` = four **or more** (shown `4+`). RIR is per set, optional on every set, and is never added to reps.
- Written only by `logSet` in the same write as weight and reps; corrected only by `editLoggedSet` (`rir` undefined = unchanged, `null` = clear). Idempotency compares RIR too.
- Never read by e1RM, goals, gym baselines, the working weight, or the weight offer (a static guard enforces it).

### The qualifiers (Bucket C, flagged for review)

The Progressive Overload Engine ladder runs first and unchanged. RIR is then read from the **planned working sets of the most recent qualifying performance** (same scope as the rule: completed, all planned sets, not a scheduled-deload week, gym-scoped for machine/cable):

| Base call | Condition | Final call | `rirEffect` |
| --------- | --------- | ---------- | ----------- |
| `progress` | any working set `rir <= RIR_AT_LIMIT` (**0**) | `hold` (no tag) | `held_at_limit` |
| `stalled` with an exactly flat e1RM window | **every** working set `rir >= RIR_TO_SPARE_MIN` (**2**) | `progress` | `released_stall` |
| anything else | — | unchanged | `null` |

- A falling e1RM window is never released, whatever the RIR. An unrecorded set never counts as 0 or as 2+. A history with no RIR yields exactly the base call.
- RIR never creates or cancels a reactive Deload, never changes insufficient history or an ordinary hold, and is ignored in scheduled-deload weeks.
- `rirEffect` is derived on read, never stored; the reason line is rendered from the constants.

### Interaction cost

- Measured with the "Set entry and tap-count method" above, same workout, 375×812 touch: **RIR unset 18 taps / 18 keystrokes** (equal to Faster Logging UX; `e2e/accounts/faster-logging.spec.ts` asserts exactly 18 / 18); RIR on the last set of each exercise **22 / 18**; RIR on every set **29 / 18** (`e2e/accounts/rir-logging.spec.ts`). Recording RIR costs one tap per set; a chip never takes focus, so the keyboard stays in reps.
- The RIR group is the one control added to the active row (Faster Logging UX's visible-control count 8 → 9, counting the group once). Below 360px its label sits above the chips so each chip stays 44px.

## Recommendation and evidence (established by Smarter & Explainable Progression)

Source: `docs/specs/15-smarter-explainable-progression-spec.md` (§6, §11; Resolved Decisions R3–R9, R13–R22, R26). Code: `src/lib/progression/engine.ts` (`DecisionEvidence` on `ReactiveDecision`), `src/lib/progression/recommendation.ts` (`buildRecommendation`, `insufficientNote` — the only copy source), `src/lib/progression/queries.ts` (`recommendation` on every progression DTO). Consumed by Exercise History & PR Intelligence ("the current recommendation and why").

### Evidence comes from the deciding branch

The engine attaches one `evidence` value at each existing return; rules, thresholds, and precedence are unchanged. Kinds: `insufficient` (count, required), `deload` (window, shared `repMin`), `progress` (window, shared `repMax`), `stalled` (rep window, trend window, `repMax`), `hold_top_once` (latest counted session all-top; progress needs the window), `hold_short` (latest counted session's working-set reps and range), `held_at_limit` / `released_stall` (RIR qualifiers, with the constant). `repMin`/`repMax` are `null` when the window's planned ranges differ. A later feature that adds a rule adds a kind and one catalog row; it never words a call outside the builder.

### What the words may claim

- **A load only where the engine has one:** Progress = the working weight + `PROGRESS_INCREMENT_LBS` (no number without a working weight: "Ready to add weight"); the scheduled deload week = the existing `SCHEDULED_DELOAD_FACTOR` load. A reactive Deload has **no** amount ("Lower the weight" / "Back off"). Bodyweight Progress points at the plan's own top ("go past 12 reps or make it harder"), never a weight or a variation.
- **Hold** = "Stay at {working weight}" (or "Hold steady" without one), no tag, muted.
- **RIR is named only when `rirEffect` is set.** The stall line names its rule ("e1RM hasn't risen over 3 sessions"), never rounded figures.
- **"Last time"** only when the latest counted session is also the latest finished one in scope; otherwise its date ("on Nov 9").
- **When:** "today" while the occurrence's session is in progress (and on the planned list); "next time" once the judged history includes the finished session (day-complete summary, exercise page).
- **The number is the judged session's, or none.** Progression reads take the working weight from completed workouts only (`currentWorkingWeightLbs(..., { completedOnly: true })`), so logging today's sets never moves today's advice; a free-weight number is printed only when it equals the last working set's load of the latest counted session (`ReactiveDecision.latestLoadLbs`), else it is withheld; a baseline rewritten by the in-progress workout is not that workout's context. The working-weight source itself is unchanged (OVE-61 tracks its extra-set and log-late limits).
- Machines and cables append " at {gym}"; nothing crosses gyms. Advisory verbs only (Try / Stay at / Lower); no fatigue, recovery (outside the deload week's own line), injury, or certainty words.
- Computed on every read, carried as strings on DTOs, never stored, never written back to a plan, weight, baseline, or goal.
