# Pitch 24 — Workout Logging Refinements

> Source: Linear document "Pitch 24 — Workout Logging Refinements" (Overload V1), pulled 2026-11-11 for the one-shot pipeline run. The text below is the Linear document unchanged except for list markers. The Linear copy reads "Status: Draft"; the owner approved it for implementation in the run prompt. Open Questions are answered in `spec.md` → Resolved Decisions.

**Milestone:** `mvp-5a-web-fixes`
**Pitch folder:** `24-workout-logging-refinements`
**Appetite:** M (Medium) — provisional
**Client:** Web only
**UI-bearing:** Yes
**Delivery:** One pitch, one implementation run, one release

**Status:** Draft — repository and source-document verification required before implementation.

## Problem

Workout logging and plan-building need several refinements to support realistic training behavior without weakening existing progression logic.

The current areas of concern are:

1. A set performed significantly below the prescribed rep minimum may receive an inappropriate maintain-weight recommendation.
2. Planned exercises need to support fixed rep targets as well as rep ranges.
3. Exercise swaps need to permit selecting exercises from other muscle groups.
4. Abdominal and bodyweight exercises need to use correct load-free logging behavior.

Two small chores will ship in the same run: clearer public trial messaging and admin membership visibility.

These changes should improve the existing experience without introducing new training features or redesigning the progression system.

## Appetite and Delivery Strategy

**Medium (M).**

The intended work is limited to existing workout logging, plan-building, exercise swapping, public-page copy, and admin account metadata.

The bundle fits M only if:

- The existing progression system can accommodate the below-minimum case without a general algorithm redesign.
- Fixed targets are compatible with the existing minimum/maximum representation.
- The bodyweight logging audit reveals no significant architectural defect.
- Admin membership status is available through existing account metadata.

If investigation exposes substantial progression-system changes or a broad bodyweight data-model problem, the bundle exceeds M.

**Scope-reduction proposal:** Keep the four core Workout Logging Refinements together and defer both chores through an explicit roadmap amendment. Do not silently omit any included item. If the core changes alone exceed M, re-estimate rather than weaken their correctness requirements.

## Scope and Plan Placement

| Included item | Placement |
| -- | -- |
| Below-minimum reps | Workout logging: Free; progression recommendations: Pro |
| Fixed rep targets | Plan building and workout logging: Free; progression recommendations: Pro |
| Swap exercise | Plan building and workout logging: Free |
| Abs and bodyweight logging audit | Workout logging: Free; applicable progression recommendations remain Pro |
| Landing page trial wording | Public pages, no subscription required |
| Admin membership visibility | Web-only admin view, restricted to authorized admins |

All six items are included in this single pitch.

## Solution

### 1. Below-minimum reps

**First establish whether the reported behavior is an actual bug.**

Trace the existing recommendation path for a set below its prescribed rep minimum. Verify the recommendation itself, not merely the displayed text. Determine whether the current progression rules already have a failure classification, reduction trigger, reassessment mechanism, or history-based exception that the reported example bypasses.

Example:

- Planned: 90 lb × 6–10
- Logged: 90 lb × 3
- Undesired behavior: An unqualified recommendation to stay at 90 lb next time, despite a clearly failed set

**Expected behavior**

A clearly failed performance must enter the existing failure-assessment path rather than automatically receiving a maintain-weight recommendation.

The decision must respect the system's existing progression constants, history requirements, and confidence in the established baseline.

A single poor set must not independently replace a reliable working-weight baseline. A minor miss must not automatically trigger a reduction.

**Rule boundary**

Classify performance relative to the prescribed minimum using the existing progression thresholds and history requirements. Where the system's established failure criteria are met, issue the applicable reassessment or reduction recommendation. Otherwise retain the existing history-based decision behavior.

Do not introduce an arbitrary new threshold or substitute a blanket "below minimum means reduce" rule.

**Required implementation investigation**

- Identify and cite the existing progression constants governing pass, hold, failure, reduction, and historical reliability.
- Verify how partially completed or mixed-performance sessions are assessed.
- Check whether reactive deloads already respond to the same performance signal.
- Check whether progress calls use the same underlying result or derive an independent recommendation.
- Prevent conflicting advice or duplicate reactions from the progression recommendation, reactive deload, and progress-call paths.
- Preserve existing rules for baseline persistence and modification.

**Acceptance checks**

- A clearly failed set does not receive an unconditional maintain-weight recommendation.
- A minor miss does not necessarily produce a weight reduction.
- A single abnormal set cannot independently overwrite a reliable historical baseline.
- Repeated or sufficiently significant failures invoke the appropriate existing reassessment/reduction behavior.
- Successful sets continue using the unchanged progression rules.
- Reactive deload and progress-call behavior remain coherent with the resulting recommendation.
- Free users can log the performance; Pro recommendation visibility follows existing entitlement rules.

**Verification gate:** Confirm whether this is a genuine bug and insert the actual existing constant names and relevant thresholds before implementation.

### 2. Fixed rep targets

A planned exercise may specify one target instead of a rep interval.

Example: `3 × 10`, rather than `3 × 8–10`.

An equal minimum and maximum may represent the fixed target internally.

**Expected behavior**

- Plan building accepts and displays one target.
- Workout logging preserves and displays that target.
- A set reaching the prescribed target counts as a pass under the applicable existing completion rules.
- A set below the prescribed target is assessed against the same target as its minimum.
- A fixed target must not create an unreachable progression threshold.

For a fixed target of 10, the target is satisfied at 10 reps. There is no separate higher upper-bound value the user must reach to qualify.

Where progression ordinarily requires reaching the top of a prescribed range, the fixed target itself serves as that threshold. Any other existing requirements—such as qualifying sets, session history, or confidence—still apply.

**Acceptance checks**

- `3 × 10` can be created, viewed, and logged without displaying an artificial range.
- Logging 10 reps satisfies the rep target.
- Logging fewer than 10 reps is below target.
- The progression threshold is reachable at 10, not at a nonexistent higher bound.
- Existing ranged prescriptions retain their current behavior.
- Pro recommendations continue following existing entitlement and progression rules.

**Verification gate:** Check all existing comparisons that assume `max > min`, especially progression qualification and plan display.

### 3. Swap exercise

The exercise-swap picker currently has a same-muscle-group restriction that is being intentionally changed.

**Expected behavior**

The user can change the picker's muscle-group filter to any supported group and choose an exercise from that group, even when it differs from the originally planned exercise's group.

The original exercise's muscle group may remain the initial filter, but it is not a constraint.

**Acceptance checks**

- The picker initially offers relevant exercises according to current behavior.
- Users can switch to any supported muscle-group filter.
- Results update to match the selected group.
- An exercise from a different muscle group can be selected and substituted.
- The workout/plan reflects the selected replacement using existing swap behavior.
- Existing restrictions unrelated to muscle-group matching remain intact.

**Existing-rule amendment:** The earlier same-muscle-group-only rule is superseded for exercise swapping. Update any conflicting PRD or roadmap wording explicitly.

No new exercise-discovery or programming functionality is included.

### 4. Abs and bodyweight logging audit

**Audit first; fix only verified defects.**

Inspect the actual logging behavior for abdominal movements and compare it with pull-ups and other established bodyweight exercise paths.

**Expected behavior**

For genuinely load-free/bodyweight movements:

- Reps can be recorded without entering a weight.
- Missing external load is not replaced by a fabricated numeric load.
- Estimated one-rep max (e1RM) is not calculated from absent load.
- No machine-based weight baseline is established from these entries.

Existing behavior for exercises with an explicitly logged external load must remain unchanged.

**Acceptance checks**

- Bodyweight abdominal exercises support reps-only logging.
- Unloaded pull-ups and other bodyweight movements retain their existing correct behavior.
- Missing load is not transformed into a misleading zero-weight or machine-weight measurement for progression.
- No e1RM is produced from missing load.
- No machine baseline is created for reps-only movements.
- If the audit finds compliant behavior, no functional change is made.

**Verification gate:** Record which exercise classifications and representative logging paths were tested, and whether a defect was actually reproduced.

### 5. Chore — Landing page trial wording

Replace ambiguous trial language on the public pages with straightforward copy.

**Approved copy direction:**

"Try Pro free for 14 days. No credit card needed. After that, keep using Overload on the free plan or upgrade for $4.99 a month."

Apply consistently wherever the trial is described publicly.

**Acceptance checks**

- Trial messaging explicitly identifies the 14-day Pro trial.
- No-credit-card wording is clear.
- The free-plan continuation and optional paid upgrade are understandable.
- The price is stated consistently as $4.99 per month.
- Conflicting or confusing trial wording is removed from public pages.
- No subscription, billing, or trial-entitlement behavior changes.

This is copy-only work.

### 6. Chore — Admin membership visibility

The admin account list must display each account's membership status.

Supported labels:

- Pro
- Free
- Comped

**Expected behavior**

Authorized admins can identify an account's membership classification from account metadata without accessing the user's workout or training information.

**Acceptance checks**

- Every account row displays the correct membership label.
- Comped accounts are distinguishable from ordinary Pro subscriptions and Free accounts.
- Only authorized administrators can access the admin account list.
- No workout logs, exercise selections, plans, performance metrics, or other training content are displayed.
- Existing admin account-management behavior remains unchanged.
- No mobile implementation is introduced.

The feature is strictly account-metadata visibility, not an expansion of admin access to user training data.

## Cross-Feature Consistency

The combined implementation must verify the following interactions:

**Fixed targets and below-minimum performance:** An exercise with a target of 10 reps uses 10 as the pass threshold and prescribed minimum for failure assessment.

**Exercise swaps and logging:** A swapped exercise follows its applicable existing logging behavior, including load-free bodyweight behavior where appropriate.

**Progression and reactive deloads:** The below-minimum refinement must not create competing or repeated decisions from overlapping progression paths.

**Plan entitlements:** Users on Free retain plan-building and workout-logging capabilities. Pro-specific recommendations remain restricted to Pro under existing entitlement rules.

**Admin privacy:** Membership information is not a route to training-content visibility.

## Out of Scope

- General progression-algorithm redesign.
- Changing progression constants except where an existing below-minimum defect requires correct application of those constants.
- New deload features or new progress-call features.
- New exercise categories, exercise recommendations, or exercise discovery.
- New training metrics, scoring systems, or calculated baselines.
- Changes to subscription pricing, checkout, or trial mechanics.
- Expanded admin permissions to inspect user training data.
- Mobile application implementation.
- Schema, endpoint, or component redesign as part of this pitch.

## Required PRD Traceability

Before this pitch is marked build-ready, compare every relevant acceptance criterion with the PRD section named **Workout Logging Refinements**.

Record separately:

1. Criteria explicitly specified by that PRD section.
2. Criteria already established elsewhere in the PRD or roadmap.
3. New clarifications supplied for Pitch 24.
4. Requirements that conflict with existing documentation and therefore need amendments.

Do not attribute the two chores to Workout Logging Refinements if the roadmap lists them separately.

Any requirement absent from the PRD must be marked as a documentation gap or an explicit pitch-level addition, not presented as an existing PRD requirement.

## Required Roadmap Amendment

The roadmap currently lists the landing-page trial wording and admin membership visibility as chores.

Amend `pitch-roadmap.md` to record that both chores are included in **Pitch 24 — Workout Logging Refinements** within `mvp-5a-web-fixes`.

The amendment must:

- Preserve Pitch 24's existing name.
- Preserve each chore's existing name.
- Identify both chores as included items rather than independent shipping units.
- Retain traceability to their original roadmap entries.
- Remove any implication that the chores ship separately.
- State that all six included items ship in the same implementation run.
- Keep the four original refinements traceable to Workout Logging Refinements.

This is a required roadmap change, not an implicit reclassification.

## Completion and Release Criteria

The pitch is complete only when:

- The reported below-minimum recommendation has been investigated and any verified defect addressed.
- Fixed-target prescriptions work through planning, logging, and applicable progression qualification.
- Cross-muscle-group exercise swapping works.
- Bodyweight and abdominal logging have been audited and any proven defects corrected.
- Public trial wording has been corrected wherever applicable.
- Admin accounts display membership status without exposing training content.
- Free, Pro, public, and admin access boundaries have been verified.
- Existing ranged-target, progression, swap, and bodyweight behaviors have not regressed.
- Relevant PRD criteria and documentation gaps have been recorded.
- The roadmap amendment is completed.
- All included work is shipped together as one run.

## Open Questions

1. **Repository verification required:** Is the below-minimum recommendation currently a reproducible bug, or is the reported outcome valid under an existing history-based rule?
2. **Repository verification required:** Which existing progression constants govern failure severity, reduction, reassessment, and baseline reliability?
3. **Repository verification required:** Do reactive deloads and progress calls independently evaluate failed performance, and could they issue conflicting recommendations?
4. **Repository verification required:** Does any existing progression logic require a strict difference between minimum and maximum reps?
5. **Repository verification required:** Do abdominal exercises already use the correct bodyweight logging path?
6. **Documentation verification required:** Which acceptance criteria are explicitly grounded in the PRD, and which need a PRD amendment?
7. **Owner call — proposed default:** Should the initially selected swap filter remain the original muscle group? Proposed answer: yes, while allowing unrestricted filter changes afterward.
8. **Owner call — proposed default:** Should the supplied 14-day trial copy be used verbatim on public pages where the full explanation fits, with shorter wording only where necessary? Proposed answer: yes.
9. **Owner call — proposed default:** If unexpected complexity pushes the work beyond M, should the two chores be deferred first through an explicit roadmap amendment? Proposed answer: yes, but only with owner approval; the preferred outcome remains shipping all six items together.
