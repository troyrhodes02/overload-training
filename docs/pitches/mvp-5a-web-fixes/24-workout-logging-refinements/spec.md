---
version: 1.0.0
status: approved
author: Claude Code (unattended pipeline run)
last_updated: 2026-11-11
pitch_reference: docs/pitches/mvp-5a-web-fixes/24-workout-logging-refinements/pitch.md
design_reference: docs/pitches/mvp-5a-web-fixes/24-workout-logging-refinements/design.md
preview_reference: docs/pitches/mvp-5a-web-fixes/24-workout-logging-refinements/preview.tsx
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: milestone "Workout Logging Refinements" (Overload V1)
---

# Workout Logging Refinements — Technical Spec

## 1. Summary

Pitch 24 closes four logging and planning gaps and ships two chores in the same run. Everything is a change to an existing surface. There is **no schema change, no migration, no new table, no new constant, and no new write path**.

The one behavioral change to the progression engine is narrow. When the most recent **finished** performance of a lift fell below its planned minimum, the engine's call becomes a hold with a new evidence kind, `reassess`, so the builder words it "Reassess the weight next time" instead of "Stay at 90 lb next time". The existing ladder (insufficient → reactive Deload on `DELOAD_CONSECUTIVE_SESSIONS` → Progress → Hold) is otherwise untouched. Fixed rep targets are ranges with equal ends, which the validator and the engine already accept; the work is display. Swap drops its same-muscle rule in both the read and the write. The trial copy is three strings. The admin directory gains a Plan column computed from entitlement and billing records through the existing pure resolver.

"Working" means:

- 90 × 3 against a planned 6–10 never yields a "Stay at 90 lb" line, and never lowers or rewrites anything.
- "3 × 10" plans, prints, logs, and progresses at 10.
- Swap reaches Crunches from a Cable Fly.
- Crunches log reps-only exactly like Pullups.
- The public pages carry the approved trial sentence.
- The owner sees Pro, Pro (trial), Comped, or Free beside each account.

## 2. Problem

- The app tells a lifter who just failed at 90 lb to stay at 90 lb, because a single below-minimum session after a normal one falls through the ladder to an ordinary hold (`hold_short`), whose action prints the working weight.
- A failed set in a workout the lifter stopped early is invisible to the engine. The performance isn't `complete` (all planned sets present), so it's excluded from the qualifying sequence, and the call is computed from older sessions. That can even say "Try 95 lb".
- The plan dialog only offers a min–max pair. "3 × 10" can be entered as 10–10, but the card and Today print "3 × 10–10", and the evidence line prints "of 10–10".
- The swap picker and the swap write both refuse any other primary muscle.
- The trial copy says "no card", which a reader found confusing.
- The admin directory doesn't show which accounts are Pro, Free, or comped.

## 3. Investigation record (pitch verification gates)

### 3.1 Below-minimum reps — **verified bug**

Existing constants (`src/lib/progression/config.ts`), unchanged:

| Constant | Value | Governs |
| --- | --- | --- |
| `MIN_QUALIFYING_SESSIONS` | 2 | historical reliability: fewer complete sessions → `insufficient`, no call |
| `DELOAD_CONSECUTIVE_SESSIONS` | 2 | reduction: the last 2 qualifying sessions each have a set below the minimum → reactive Deload |
| `PROGRESS_CONSECUTIVE_SESSIONS` | 2 | pass: every set at the top of the range, 2 sessions running → Progress candidate |
| `STALL_WINDOW_SESSIONS` | 3 | e1RM stall gate on Progress |
| `RIR_AT_LIMIT` / `RIR_TO_SPARE_MIN` | 0 / 2 | RIR qualifiers on Progress/stall only |
| `PROGRESS_INCREMENT_LBS`, `SCHEDULED_DELOAD_FACTOR`, `LOAD_STEP_LBS` | 5, 0.9, 5 | display loads |
| `BASELINE_CORRECTION_THRESHOLD_PERCENT` (`src/lib/gyms/baselines.ts`) | 15 | baseline correction from the median working **weight**, only when every planned set is present |

The failure classification already exists: `hasBelowMin(p)`, meaning some planned working set has `reps < repMin`. Reproduction, traced through `evaluateBase` and `buildRecommendation`:

| History (planned 6–10, 90 lb) | Old call | Old action |
| --- | --- | --- |
| first ever: 90 × 3, 8, 8 | insufficient | none (no bug) |
| 90 × 8, 8, 8 then 90 × 3, 8, 8 | hold (`hold_short`) | **"Stay at 90 lb next time"** ← bug |
| two complete sessions each with a set below 6 | deload | "Lower the weight next time" (correct) |
| 90 × 10, 10, 10 twice, then a finished workout with only 90 × 3 logged | progress (the short session is ignored) | **"Try 95 lb next time"** ← bug |
| 90 × 8, 8, 8 twice, then a short 90 × 3 | hold (`hold_short`, dated the older session) | **"Stay at 90 lb next time"** ← bug |

Other paths checked:

- **Reactive deload and progress calls:** there is one engine call per scope. Deload, Progress, Hold, the RIR qualifiers, and the recommendation are all produced from one `ReactiveDecision`, so no path computes an independent, conflicting recommendation. The fix lives inside that single decision, so it can't duplicate one.
- **Baseline:** the gym baseline depends on weight, not reps, and is written only on completion. 90 × 3 at a 90 lb baseline can't move it. Nothing in this pitch writes.
- **Partial sessions:** short workouts feed the e1RM trend, goals, and records (`finished`), but not the call (`complete`). This pitch changes only the case above.

### 3.2 Fixed targets — **display defects only**

- Validation (`parsePlannedExercise`) rejects only `max < min`, so equal values are accepted. Readiness (`readiness.ts`) also uses `min <= max`.
- The engine uses `reps >= repMax` (pass) and `reps < repMin` (failure). Both are reachable at min = max = 10: 10 passes, 9 is below the target.
- No code requires `max > min`. Defects are display only: `scheme()` in `src/lib/logging/queries.ts`, the card header in `exercise-card.tsx`, and the `hold_short` evidence in `recommendation.ts` print "10–10". `prescription()` and the add page already print one number.
- The plan dialog offers only min and max inputs.

### 3.3 Abs / bodyweight audit — **no defect reproduced**

Loading mode is decided only by `equipmentType` (`loadingMode`): `bodyweight` means reps only. In the seeded catalog, free-exercise-db "body only" maps to `bodyweight`.

Exercises and paths checked:

- Abdominals-primary strength exercises with "body only": 38 (Crunches, Sit-Up, Hanging Leg Raise, Plank, Reverse Crunch, Decline Crunch …), plus 4 stretching. They share `bodyweight` with Pullups and Chin-Up.
- Write (`logged-sets.ts`): a weight on a bodyweight set is rejected ("This is a bodyweight exercise — log reps only."), and weight is stored as `NULL`, never 0.
- Baseline (`baselines.ts`): returns early for `!requiresExternalWeight`. `isGymVariable` is false for bodyweight.
- e1RM (`e1rm.ts` `loadedSets`): null-weight sets are excluded. The read layer runs the engine with `e1rmApplicable: false`, so there is no stall gate, no e1RM points, and no load suggestion.
- Card: the weight input is hidden, with "· bodyweight, reps only".
- Goals: weight goals are refused for bodyweight exercises.

Two groups are **not** reps-only by the existing documented rule (`loading-mode.ts`: "Bodyweight movements the source files under `other` … stay `external_load`; the lifter can add a custom exercise with Bodyweight equipment"), and this pitch leaves them alone:

- Loaded abs (Cable Crunch, Ab Crunch Machine, Weighted Crunches) correctly need a weight.
- A few load-free abs filed under `other`/`exercise ball` (Ab Roller, Suspended Reverse Crunch, Exercise Ball Crunch) also need one.

Reclassifying those would change a library row's loading mode under existing history, which the module forbids. It's recorded as a follow-up, not a fix (RD-9).

Tests added: integration proof that a library core/abs `bodyweight` exercise logs reps-only, stores `NULL`, creates no baseline, and yields no e1RM, matching a Pullups-style exercise.

### 3.4 PRD traceability

| # | Criterion | Source |
| --- | --- | --- |
| 1 | 90 × 3 vs 6–10 never recommends staying at 90 lb; no baseline overwrite by itself | **PRD → Workout Logging Refinements** (explicit) |
| 1 | A 3 × 10 exercise plans, logs, and progresses correctly | PRD (explicit) |
| 1 | Swap can reach exercises in any muscle group | PRD (explicit) |
| 1 | Not every missed set reduces weight; existing constants and history | PRD edge case (explicit) |
| 2 | Abs log like other bodyweight movements | PRD "What it does" + roadmap DoD (not an acceptance criterion in the PRD: **documentation gap**) |
| 2 | Free capture, Pro recommendations | PRD Plans & Billing; roadmap plan placement |
| 2 | Admin shows no training content | PRD Admin Center & Feedback |
| 3 | Reassess wording, short-session failure handling, the in-progress exclusion, the Range/Fixed control, the swap muscle filter defaulting to the planned muscle, the Plan column precedence | **pitch-level additions** (this spec's Resolved Decisions) |
| 3 | Trial copy text | roadmap chore (approved copy direction); not a PRD criterion |
| 3 | Admin Pro/Free/Comped labels | roadmap chore; PRD Admin Center lists metadata columns but not plan: **documentation gap** |
| 4 | "Only other exercises tagged to the same muscle group are offered" (PRD Journey: Swapping; PRD Exercise Swap feature, AC and edge case; CLAUDE.md Planned-versus-logged) | **conflict → amended** in this pitch (RD-6) |

## 4. Scope and non-scope

**In scope:** the six items above, the doc amendments named in RD-12, a release-note entry, and tests.

**Out of scope:**

- New progression constants, thresholds, or reduction amounts.
- Any change to Deload, Progress, the stall gate, or RIR rules.
- Re-judging today's advice from sets in the workout in progress.
- Counting short workouts toward the Deload or Progress windows.
- Reclassifying library equipment.
- Swap suggestions or an "any muscle" mode.
- Plan import changes (it already derives min = max for "3x10").
- Billing, trial, or pricing behavior.
- An admin plan filter.
- Mobile.

## 5. Core concepts

| Concept | Description |
| --- | --- |
| Performance `finished` | New **required** field on the engine's `Performance`: the workout's `LoggedSession` is complete, whether or not every planned set was logged. `complete` keeps its meaning (finished **and** all planned sets present). Derived on read from the existing status. |
| Reassess call | Engine state `hold` (no tag) with evidence `{ kind: "reassess", reps, repMin, repMax, sessions: DELOAD_CONSECUTIVE_SESSIONS, latest }`. Produced when the latest finished, non-scheduled-deload performance in scope has a planned working set below its minimum and no reactive Deload applies. Builder output: `kind: "reassess"`, `tone: "strong"`. |
| Fixed rep target | A `SessionExercise` / `LoggedExercise` with `targetRepMin === targetRepMax`. Not a new type. Printed through one pure formatter, `formatRepTarget(min, max)`. |
| Membership | Admin-only classification `pro \| trial \| comped \| free` from the resolved entitlement's sources, precedence subscription → comp → trial → free (the same precedence as `getAccountBilling`). |

## 6. States and lifecycle

The engine ladder after this pitch (changes in **bold**):

```text
1. qualifying (complete, non-deload-week) < MIN_QUALIFYING_SESSIONS        → insufficient
2. last DELOAD_CONSECUTIVE_SESSIONS qualifying all hasBelowMin               → deload
3. **latest finished non-deload-week perf is short (not complete) and
   hasBelowMin**                                                            → **hold / reassess(that perf)**
4. last PROGRESS_CONSECUTIVE_SESSIONS qualifying all top                     → progress (→ stall gate)
5. hold: latest qualifying all top → hold_top_once
         **latest qualifying hasBelowMin → reassess(latest qualifying)**
         else → hold_short
RIR qualifiers (unchanged) apply only to base progress/stalled, so never to a reassess hold.
```

Notes:

- Step 3 only adds a short session the ladder couldn't see. A complete below-minimum latest session can't be a Progress candidate (it isn't all-top), so it always reaches step 5.
- With step 3, a short failed workout outranks an older Progress candidate. Load is never increased after a failure. That's the same safety precedence the ladder already gives Deload.
- Scheduled-deload-week performances are excluded from step 3 (never retroactively judged). In-progress workouts aren't finished, so they're excluded too.

## 7. UI integration (binding preview: `preview.tsx`)

| Screen | Change | Data |
| --- | --- | --- |
| Planned exercise dialog | `Tabs` "Range / Fixed" (aria-label "Rep target type"), on the Reps label row. Fixed shows one `Input` "Target reps". Edit opens in Fixed when min = max. Mode switch carries values (min → target, target → both). Submit sends `targetRepMin = targetRepMax = target`. Save stays disabled while the values equal the initial ones | unchanged action inputs |
| Exercise card header | `{plannedSets} × {formatRepTarget(min, max)}` | `plannedRepRange` (unchanged DTO) |
| Today planned list / summary scheme | `scheme()` uses `formatRepTarget` | unchanged |
| Recommendation (card, Today, summary, exercise page) | reassess wording; the strong tone already styles it | `RecommendationDto.kind` gains `"reassess"` |
| Swap picker | "Planned: {muscle}". A labelled `Select` "Muscle group" over `MUSCLE_GROUPS` with the current value; change → `router.replace(?muscle=…)` in a transition, list dims while pending, search text kept. The empty state names the selected group and keeps the Select. The locked state is unchanged | `SwapContextDto` gains `plannedMuscle`, `selectedMuscle`, `selectedMuscleLabel` |
| Card archived prompt | drop "same-muscle" | — |
| Admin directory | "Plan" column after Status (md+); phone meta line `Active · Plan · Joined …`. `PlanBadge`: Pro = outline badge; trial = outline "Pro" + muted "trial"; Comped = secondary badge; Free = muted text | `AdminAccountRowDto.membership` |
| Public pages | `PRICING.trial`, `TRIAL_NOTE`, `BLIZZY_PAGE.trialFit` | constants |

The reassess copy is fixed by the builder (design doc Screen 2 table):

- Action: `Reassess the weight {when}` for external load, `Reassess the difficulty {when}` for bodyweight.
- Evidence: `{Last time|On Mon D}: {reps joined ", "} of {target}{ at Gym}, below {repMin}. A deload follows 2 complete sessions running below {repMin}.`
- `{target}` is `formatRepTarget(repMin, repMax)`.

`hold_short` evidence also uses `formatRepTarget`.

**User guidance.** Tour: no change. Release note: one significant `internal` entry (RD-14), built in the guidance ticket via `overload-onboarding`, with the design doc's text.

**Client scope.** Web only. Plan placement:

- Plan building, swap, and logging: Free.
- The reassess recommendation: the existing `progression_insights` capability. Its gating is unchanged, since the builder output flows through the already-gated progression read paths.
- Plan column: admin only (`requireAdmin`).

## 8. Data model

**No change.** No Prisma model, enum, migration, or RLS change. `targetRepMin`/`targetRepMax` stay as they are.

| Derived | Stored? | From |
| --- | --- | --- |
| reassess call | no | logged sets, the session's completion status, the planned range, the mesocycle week |
| membership | no | `Entitlement` + `BillingAccount` through `computeEntitlement` |

## 9. Authorization and access control

| Operation | Gate |
| --- | --- |
| `swapExerciseAction` | authenticated account (unchanged). Candidate read through the account-scoped client: the library plus own custom exercises, active only, never another account's custom (not-found-equivalent "That exercise isn't available."). Locked once a set exists (unchanged). **The muscle check is removed.** |
| swap page `?muscle=` | parsed with `isMuscleGroup`; an unknown value falls back to the planned muscle. Never used to choose an account |
| plan dialog | unchanged server actions and validation |
| progression reads | unchanged capability gating (`progression_insights`); a Free account still gets `locked` and no recommendation |
| `listAccounts` (Plan column) | `assertAdmin` (unchanged); reads `entitlement` and `billingAccount` through `adminDb()`, selecting only the fields the resolver needs. No training model is read. The admin privacy sentinel covers the new field |
| public copy | public |

## 10. Server actions and API surface

No new actions.

- `swapExercise(account, { loggedExerciseId, newExerciseId }, tx?)` behaves as before, minus the `primaryMuscle` comparison. The `plannedExercise.primaryMuscle` include is dropped.
- `getSwapContext(account, loggedExerciseId, muscle?: string)` gets a new optional argument, the requested muscle.
- `listAccounts` adds `membership` to each row.
- `getAdminAccount` rows get it too, through the shared `toRow`.

## 11. Validation rules

| Field | Rule | Error |
| --- | --- | --- |
| Fixed target | whole number 1–`REPS_MAX` (the existing per-field rules applied to min and max) | the existing messages, shown under the single input |
| `muscle` search param | must be a canonical muscle group, else ignored | none (fallback) |
| `newExerciseId` | uuid, exists for this account, `deletedAt: null` | `validation_error` "That exercise isn't available." (unchanged) |

## 12. UI data contracts

```ts
// src/lib/progression/types.ts
type DecisionEvidence = /* existing kinds */ | {
  kind: "reassess"; reps: number[]; repMin: number; repMax: number;
  sessions: number; latest: PerformanceRef;
};
type RecommendationDto = { kind: "progress" | "hold" | "reassess" | "deload" | "scheduled_deload"; /* … */ };

// src/lib/logging/queries.ts
type SwapContextDto = {
  loggedExerciseId: string; plannedExerciseName: string;
  plannedMuscle: MuscleGroupValue; primaryMuscleLabel: string;   // planned
  selectedMuscle: MuscleGroupValue; selectedMuscleLabel: string;
  swapLocked: boolean; candidates: SwapCandidate[];             // selected muscle only
};

// src/lib/admin/types.ts
type MembershipValue = "pro" | "trial" | "comped" | "free";
type AdminAccountRowDto = { /* existing */ membership: MembershipValue };

// src/lib/plan/rep-target.ts (pure, client-safe)
function formatRepTarget(min: number, max: number): string; // "10" | "6–10"
```

## 13. Testing strategy

```text
Engine (unit, tests/unit/progression-below-min.test.ts)
GIVEN 90×8,8,8 then 90×3,8,8 (6–10)            THEN hold, evidence reassess(latest=2nd), never hold_short
GIVEN two complete sessions each below 6        THEN deload (unchanged; reassess never shadows deload)
GIVEN 8,8,8 then 7,7,6 (in range)              THEN hold_short (a minor miss: no reassess, no reduction)
GIVEN only one session (3,8,8)                  THEN insufficient (no call)
GIVEN 10,10,10 ×2 then a FINISHED short [3]     THEN hold/reassess(short) — never progress
GIVEN 10,10,10 ×2 then an IN-PROGRESS [3]       THEN progress (unchanged: today's advice ignores the open workout)
GIVEN 8,8,8 ×2 then a short [3] in a scheduled-deload week   THEN hold_short (deload week never judged)
GIVEN 8,8,8 ×2 then a finished short [8]         THEN unchanged ladder
GIVEN reassess base + RIR 0 on the latest       THEN no held_at_limit (RIR only qualifies progress/stalled)
Fixed target 10/10: 10,10,10 ×2 → progress; 10,10,9 → below min; 9 then 9 → deload; 10,10,10 once → hold_top_once
Builder (unit): reassess action/evidence for external, bodyweight, gym, "On Oct 13", fixed target "of 10";
  hold_short prints "of 10" for 10/10; reassess never contains "Stay at" or a weight; kind "reassess", tone strong
formatRepTarget: (10,10) → "10"; (6,10) → "6–10"

Integration (embedded Postgres)
- progression-recommendation: 90×8,8,8 then 90×3,8,8 through the real read layer → action "Reassess the weight next time"; a Free account → locked, no recommendation
- swap: from a chest planned exercise to a core (bodyweight) exercise succeeds; the plan template is unchanged; an archived candidate is refused; another account's custom exercise is refused as unavailable; locked after a set (unchanged)
- getSwapContext: default = planned muscle; ?muscle=core lists core only; an invalid muscle falls back
- bodyweight audit: a library core exercise with bodyweight equipment logs reps-only, stores NULL, no baseline row, no e1RM points
- plan: add/update with min=max=10 stores 10/10; the card scheme and Today print "3 × 10"
- admin: listAccounts membership for a subscription (pro), trial only (trial), comp (comped), comp + subscription (pro), expired trial (free); a non-admin is refused; the privacy sentinel still passes
Unit (UI): planned-exercise dialog Range/Fixed carry-over and submit values; PlanBadge labels; swap picker renders Select + empty state
Marketing: the copy tests expect the approved sentence; banned phrases still absent
Regression: the existing progression, RIR, evidence, recommendation, history, swap, logging, admin, and marketing suites stay green
```

## 14. Acceptance criteria

**Below-minimum**
- [ ] 90 × 3 against 6–10 after a normal session yields "Reassess the weight next time", never "Stay at 90 lb".
- [ ] A finished short workout with a below-minimum set is never followed by a Progress call.
- [ ] Two complete sessions running below the minimum still yield the reactive Deload.
- [ ] An in-range miss still yields "Stay at … lb".
- [ ] Insufficient history still yields no call.
- [ ] No write path changed, and no baseline is touched.

**Fixed targets**
- [ ] The dialog creates and edits a single target.
- [ ] Row, Today, card, and evidence print "10", not "10–10".
- [ ] 10 reps passes, 9 is below the target, Progress is reachable at 10.
- [ ] Ranges are unchanged.

**Swap**
- [ ] The picker opens on the planned muscle, can select any group, and lists that group.
- [ ] A cross-muscle swap succeeds server-side.
- [ ] Lock, archived, and ownership rules are unchanged.

**Abs audit**
- [ ] The audit is recorded (§3.3), with no functional change and an integration proof.

**Trial copy**
- [ ] Three strings updated from the constants.
- [ ] No billing or trial code changed.

**Admin**
- [ ] Every directory row shows Pro / Pro trial / Comped / Free.
- [ ] Admin only.
- [ ] No training content.

**Docs**
- [ ] Roadmap and PRD amendments (RD-12), the method note, and a release note.

## 15. Explicit non-goals

- ❌ Program generation, AI coach, social, ads, dated goals, rest timer, cardio progression, admin view of training content. **Permanent.**
- ❌ A reduction amount for a reactive call, re-judging during a workout, counting short workouts toward windows. **Deferred** (needs a pitch).
- ❌ Reclassifying load-free "other" abs. **Deferred** (owner decision, see Open Questions).
- ❌ Mobile. **Deferred** to the mobile slices.

## 16. Resolved Decisions

Recorded under the Autonomous Pipeline Policy (`CLAUDE.md`); authority in brackets.

- **RD-1. The bug is real, and the fix is a reassess hold, not a reduction.** One below-minimum session after a normal one becomes `hold` + `reassess`. Reduction stays the existing two-session reactive Deload. No threshold or constant is added. [Pitch: "do not introduce an arbitrary new threshold"; PRD edge case; existing `hasBelowMin`, `DELOAD_CONSECUTIVE_SESSIONS`.]
- **RD-2. "Clearly failed" means below the planned minimum, and a minor miss means short of the top but in range.** No severity scale (for example "3 of 6 is worse than 5 of 6") is introduced. [Pitch rule boundary; existing failure classification.]
- **RD-3. A finished short workout's below-minimum set is considered (step 3), but it still doesn't count toward the Deload or Progress windows.** It blocks Progress and a stay-at-weight line without changing what "qualifying" means (R9/R44 kept). [Pitch "verify how partially completed sessions are assessed"; PRD criterion "never recommends staying"; safety precedence.]
- **RD-4. Today's advice is not re-judged from sets in the workout in progress.** The card keeps advising from finished workouts, as before; the next read after Finish reflects the failure. Reacting mid-workout would be new autoregulation. [Pitch out of scope: new progress-call features; existing R18.]
- **RD-5. The reassess action prints no weight.** The engine has no number it can stand behind, so it never invents one. [Smarter & Explainable Progression R7/R31: no reactive-deload number; an untrusted number is withheld.]
- **RD-6. The same-muscle swap rule is removed in the read and the write.** The planned muscle is the initial filter (Open Question 7, proposed default adopted). A `Select` over every canonical group, with no "any muscle" mode. PRD and CLAUDE.md wording amended. [Pitch §3 explicit supersession; OQ7.]
- **RD-7. Fixed target UI: a Range/Fixed `Tabs` control in the existing dialog.** Stored as min = max; the server is unchanged. Edit opens in Fixed when min = max. [Pitch §2; existing validation.]
- **RD-8. "Top of the range" wording in evidence kinds that carry no range (stalled, held_at_limit, mixed-range progress) is kept.** For a fixed target it reads as reaching the target, and changing it is copy churn outside the defect. [Scope discipline.]
- **RD-9. Abs audit: no defect, no change.** Load-free abs filed under `other`/`exercise ball` keep needing a weight, per the documented loading-mode rule (equipment is immutable under history). Workaround: a custom Bodyweight exercise. Flagged for an owner decision. [Pitch "fix verified defects only"; `loading-mode.ts`.]
- **RD-10. Trial copy is the approved sentence verbatim** on `/pricing` and the CTA note. `/blizzy` keeps its sentence's purpose with "try Pro free for 14 days, no credit card needed". Numbers come from `TRIAL_DURATION_DAYS` and `PRICE_DISPLAY.monthly`. [Open Question 8, proposed default adopted.]
- **RD-11. Admin Plan column: Pro (subscription), Pro + "trial" (trial only), Comped, Free, with precedence subscription → comp → trial.** The trial note keeps a free trial from reading as a paid subscriber, while the three pitch labels stay the only words. [Pitch §6; `getAccountBilling` precedence; PRD "a comp is never counted as a paying subscriber".]
- **RD-12. Doc amendments this run makes, because the owner-approved pitch mandates them:** `pitch-roadmap.md` (chores included in Pitch 24, one run), `prd.md` (swap rule, Workout Logging Refinements criteria), and both `CLAUDE.md` copies (the swap sentence), plus `method-note.md`. This deliberately overrides the general "no `docs/planning/` edits during a run" rule, and is reported in the owner notes. [Pitch "Required Roadmap Amendment" and "Update any conflicting PRD or roadmap wording explicitly"; run prompt §3.]
- **RD-13. All six items ship together, and the chores are not deferred.** [Open Question 9: the scope stayed within M; no schema change.]
- **RD-14. Release note: one significant internal entry, and no tour change.** The design doc proposed a non-significant entry. The guidance ticket raised it to significant, because `overload-onboarding` flags as significant any fix to the correctness of recommendations, and the below-minimum fix is one. No tour step: there is no new surface, and the Plan step still reads true. [`overload-onboarding` rubric; design doc §12.]

## 17. Open Questions

1. **(Owner, non-blocking)** Should the load-free abs filed as `other`/`exercise ball` (Ab Roller, Suspended Reverse Crunch, Exercise Ball Crunch) become reps-only? That needs a catalog equipment decision for rows that may already carry logged weights. Default: unchanged.
2. **(Owner, non-blocking)** Should a short workout ever count toward the reactive Deload window? Default: no (RD-3).

## 18. Future considerations

- `formatRepTarget` and the reassess evidence are pure and client-safe, ready for the shared package in the mobile slices.
- A severity-aware reduction amount would be its own pitch.
