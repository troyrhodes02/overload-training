# Testing Patterns

Standard test patterns for Overload feature specs.

The planning docs do not choose a test runner or a test database. The Foundation spec must decide both and record them. Until then, write cases in the framework-agnostic format below, and never run tests against the Supabase dev or production database.

## Test case format

Use GIVEN/WHEN/THEN structure:

```text
TEST: descriptive_snake_case_name
GIVEN: Preconditions describing initial state
  - Specific entity states
  - Relationships that exist
  - Any relevant configuration
WHEN: The action being tested
  - The server action call with a specific payload, OR
  - The read function being evaluated
THEN:
  - Expected state changes
  - Expected ActionResult shape
  - Side effects (baseline correction, completion state)
```

## Priority

This order matches `CLAUDE.md` → Testing and must not disagree with it:

1. **Logged history integrity (adversarial, and first).** Everything the product tells the lifter is derived from logged sets, and a lost or silently altered history cannot be rebuilt. This gates all dependent work.
2. **Gym baseline isolation and atomicity.** This is the Architecture Doc's biggest technical risk.
3. **The progression engine.**
4. **Missed-day handling.**
5. **Auth and RLS.**

Lean tests or manual verification are acceptable for plain CRUD: the exercise library, gym list, and cardio log. Anything that writes or deletes logged history is never lean.

## Required test categories

Every spec must include tests in these categories.

### 1. Happy path

```text
TEST: log_set_basic
GIVEN: A LoggedSession in progress with a LoggedExercise for Barbell Bench Press, no gym
WHEN: logSet is called with setNumber 1, weightLbs 185, reps 8
THEN:
  - A LoggedSet exists with weightLbs 185 and reps 8
  - Result is { ok: true } with the new set id
  - createdAt is set
  - No tag or e1RM value is written anywhere
```

### 2. State transition

```text
TEST: archive_goal_on_completion
GIVEN: A Goal for Barbell Bench Press 315 x 1 with status active, and a logged 315 x 1
WHEN: Goal progress is evaluated
THEN:
  - Goal.status becomes archived
  - The completion card is offered to the UI
  - The logged sets are unchanged

TEST: reactivate_archived_mesocycle_unspecified
GIVEN: A Mesocycle with status archived
WHEN: An action tries to set it back to active
THEN:
  - Behavior matches whatever the Split & Mesocycle Builder spec decided
  - If undecided: invalid_state_transition and state unchanged
```

### 3. Validation

```text
TEST: validation_negative_weight
GIVEN: A logSet request with weightLbs -5
WHEN: logSet is called
THEN:
  - error: validation_error
  - details identify weightLbs
  - No LoggedSet is created

TEST: validation_cross_muscle_group_swap
GIVEN: A planned Barbell Bench Press (chest) and a replacement of Seated Leg Curl (hamstrings)
WHEN: swapExercise is called
THEN:
  - error: validation_error
  - The LoggedExercise is unchanged
  - The planned Session is unchanged
```

### 4. Side effects

```text
TEST: baseline_correction_same_transaction
GIVEN: A GymExerciseBaseline for Chest Press Machine at Downtown Gym of 120 lbs
WHEN: logSet records 90 lbs at Downtown Gym, beyond the correction margin
THEN:
  - The LoggedSet exists
  - The Downtown Gym baseline is updated
  - Both writes committed together

TEST: baseline_atomicity
GIVEN: The same precondition
WHEN: The baseline update fails midway through logSet
THEN:
  - No LoggedSet persists
  - The baseline is unchanged
```

### 5. Security and privacy

Overload is single-user, so there is no cross-owner isolation to test. The adversarial work here is about history and the public Data API.

```text
TEST: history_survives_archive
GIVEN: An Exercise with logged sets across three LoggedSessions
WHEN: archiveExercise is called
THEN:
  - Exercise.deletedAt is set
  - listExercises (pickers) no longer returns it
  - All three LoggedSessions still return the exercise and every set

TEST: hard_delete_rejected
GIVEN: An Exercise referenced by a LoggedExercise
WHEN: prisma.exercise.delete is attempted directly
THEN:
  - The database rejects it (onDelete: Restrict)
  - No history row changes

TEST: data_api_denied
GIVEN: The anon key and every table in the public schema
WHEN: A Data API read is attempted on each table
THEN:
  - Every response is empty or denied
  - No application row is returned

TEST: unauthenticated_redirect
GIVEN: No session
WHEN: Any app route or server action is requested
THEN:
  - Redirected to login, or error: unauthorized
  - No data is returned
```

### 6. Edge cases

```text
TEST: empty_collection
GIVEN: No exercises match the filter
WHEN: listExercises is called with search "zzz"
THEN:
  - Success, not an error
  - items: []
  - total: 0

TEST: first_time_exercise_no_tag
GIVEN: An exercise logged for the first time
WHEN: progressionTag is computed
THEN:
  - null (hold), never progress or deload

TEST: first_log_at_new_gym_establishes_baseline
GIVEN: A machine exercise with no baseline at Campus Rec Center
WHEN: logSet records a weight there
THEN:
  - A baseline is created with that weight
  - It is not treated as a correction

TEST: swap_with_no_alternatives
GIVEN: A muscle group with only one exercise in the library
WHEN: The swap picker is requested
THEN:
  - An empty list with an explanation, not an error

TEST: double_submit_logged_set
GIVEN: A set already logged at (loggedExerciseId, setNumber 1)
WHEN: logSet is called again with the same keys
THEN:
  - error: conflict (default assumption; see api-conventions.md)
  - Exactly one set exists
```

Draw further edge cases from the PRD: archiving an exercise still assigned to a pending day, a mesocycle with no exercises, a partially logged day resumed later the same day, zero weight or reps entries, and consecutive missed days.

### 7. Invariant tests

System properties that must always hold, in the order `CLAUDE.md` ranks them.

```text
TEST: logged_history_never_orphaned
GIVEN: Any system state
THEN: Every logged_exercises row points at an existing exercise, and every logged_sets row points at an existing logged_exercises row
QUERY: SELECT count(*) FROM logged_exercises le LEFT JOIN exercises e ON e.id = le.exercise_id WHERE e.id IS NULL
EXPECT: 0
```

```text
TEST: logged_sets_written_only_by_the_module
GIVEN: The source tree
THEN: No file other than lib/logging/logged-sets.ts calls prisma.loggedSet.create, .update, or .delete
VERIFY: A static search of the repository, run in CI
```

```text
TEST: baseline_correction_scoped_to_one_gym
GIVEN: Baselines for the same exercise at Downtown Gym and Campus Rec Center
WHEN: A correction is applied at Downtown Gym
THEN: The Campus Rec Center baseline is byte-for-byte unchanged
VERIFY: Read both rows before and after
```

```text
TEST: derived_values_never_stored
GIVEN: Any system state
THEN: logged_exercises and logged_sets have no column holding a progression tag or an e1RM
QUERY: SELECT column_name FROM information_schema.columns WHERE table_name IN ('logged_exercises','logged_sets') AND (column_name ILIKE '%tag%' OR column_name ILIKE '%e1rm%' OR column_name ILIKE '%one_rep%')
EXPECT: zero rows
```

```text
TEST: rls_enabled_on_every_table
GIVEN: Any system state
THEN: Every table in the public schema has row-level security enabled
QUERY: SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
EXPECT: zero rows (the _prisma_migrations table is reachable through the Data API too and must be covered)
```

### 8. Integration scenarios

```text
TEST: missed_wednesday_shift
SCENARIO: The lifter skips Wednesday's Pull Day 1 and chooses to shift

STEP 1: Open the app on Thursday with Wednesday uncompleted
VERIFY:
  - The three-way prompt appears: log it late, shift, skip

STEP 2: Choose shift
VERIFY:
  - The remaining days of that week move forward by one
  - The following week uses the normal alignment
  - The prompt does not reappear on the next open
```

```text
TEST: edit_past_set_changes_tag
SCENARIO: A mistyped weight is corrected

STEP 1: Log Hack Squat sets that make the progression rule return progress
VERIFY:
  - progressionTag is progress

STEP 2: editLoggedSet corrects one set so the range is no longer met
VERIFY:
  - progressionTag is now null (hold)
  - No stored tag was changed, because none exists
```

```text
TEST: scheduled_deload_suppresses_reactive_check
SCENARIO: Week 5 of a 5-week mesocycle is the scheduled deload

STEP 1: Log a lift that would trigger a reactive deload in any other week
VERIFY:
  - No reactive deload tag appears

STEP 2: Move to week 6
VERIFY:
  - The reactive check resumes normally
```

### 9. Regression tests

One per bug fixed, named for the behavior rather than the ticket, with the original failure reproduced.

## Test data factories

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Field names follow schema.prisma; adjust if the schema differs.
export async function createTestExercise(
  overrides: Partial<Prisma.ExerciseUncheckedCreateInput> = {},
) {
  return prisma.exercise.create({
    data: {
      name: "Barbell Bench Press",
      muscleGroup: "chest",
      equipmentType: "barbell",
      isCustom: false,
      ...overrides,
    },
  });
}

export async function createTestGym(overrides: Partial<Prisma.GymUncheckedCreateInput> = {}) {
  return prisma.gym.create({
    data: { name: "Downtown Gym", address: "Downtown, near the river", ...overrides },
  });
}
```

Factory guidelines:

- Provide sensible defaults for all required fields and accept partial overrides.
- Use realistic training values (185 × 8, not 1 × 1) and lbs throughout.
- Generate ids with the schema's default; do not hardcode them.
- Name clearly: `createTest{EntityName}`.
- Keep factories in a shared test-support directory, and reset the test database between tests.

## Derived-state verification

Progress, deload, and e1RM are computed, so assert them through the pure functions rather than through stored values. Test threshold boundaries using the named constants from `lib/progression/config.ts`, not magic numbers: one session below the threshold must give no tag, and exactly at it must give `progress`. The function names are set in the Progressive Overload Engine spec.

## Error response verification

Be specific about error results: code, message shape, and any structured details.

```text
THEN:
  - Result: { ok: false }
  - error.code: `validation_error`
  - error.details.weightLbs is present
```

## Database state verification

For complex operations, verify the resulting rows directly rather than trusting the result. After `logSet`, read back the `LoggedSet` and the `GymExerciseBaseline` row.

## Negative tests

Always test what should *not* happen.

```text
TEST: edit_past_set_leaves_other_sets_untouched
GIVEN: A LoggedExercise with three sets
WHEN: editLoggedSet changes set 2
THEN:
  - Sets 1 and 3 are unchanged
  - No new LoggedSet rows are created

TEST: archive_does_not_delete_history
GIVEN: An archived Gym with logged exercises
WHEN: The history view loads
THEN:
  - Every logged exercise at that gym still renders with the gym name
  - No rows were removed
```
