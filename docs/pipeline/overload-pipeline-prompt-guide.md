# Overload — One-Shot Pipeline Prompt Guide

How to turn a finished Overload pitch into a single prompt that lets Claude Code take it from pitch document to a reviewed, verified feature branch without anyone supervising. Written so a generator with no other context (ChatGPT, Claude, anything) can produce the prompt from its inputs: the pitch, Overload's `CLAUDE.md`, the planning docs, and this guide's Overload profile and standing knowledge (Appendices C and D).

---

## 1. What a run prompt is, and what it is not

A run prompt is pasted once into Claude Code. It carries a pitch through design doc, UI design preview (for every UI-bearing pitch), spec, Linear tickets, implementation, review, audit, and a merge into `staging`. It never merges into `main`.

It works because three things are settled before the run starts:

1. **Every open question in the pitch has an answer.** An unattended run cannot stop and ask, so a question left open gets answered by whichever component happens to need it first, and that answer is usually wrong in a way nobody sees until a later pitch builds on it.
2. **The boundaries that would halt the run are named.** The run is told which specific temptations to treat as stop conditions for this pitch.
3. **The project's `CLAUDE.md` supplies the standing rules.** Stack, invariants, security model, and the stop conditions themselves live there, under "Autonomous Pipeline Policy". The prompt points at them and never restates them.

The prompt is **not a summary of the pitch**. Claude Code pulls the pitch itself. The prompt exists to carry decisions the pitch refused or failed to make, plus the pipeline mechanics.

---

## 2. Inputs the generator needs

**Required**

- The pitch document, full text.
- Overload's `CLAUDE.md`. It defines the stop conditions, invariants, stack, and product boundaries. Without it the scope note will be invented rather than grounded. If its "Autonomous Pipeline Policy" section is missing, tell the human before generating anything.
- The planning docs the pitch cites: Product Brief, PRD, Architecture Doc, Pitch Roadmap.
- The Overload profile (Appendix C) and standing knowledge (Appendix D).

**Helpful**

- Earlier run prompts for Overload. They contain constants and conventions later pitches should reuse rather than reinvent.
- `docs/planning/method-note.md`, if it exists. It holds constants earlier runs recorded.

**If something required is missing, ask once.** Batch the questions, three at most. Typical ones: a profile cell still marked unconfirmed, a merge-behavior override, a number that is really the human's own risk appetite (see 4.2, bucket D).

Do not ask about anything derivable from the docs.

---

## 3. Anatomy of the prompt

In this order:

1. **Opening paragraph.** Names the pitch, the Linear project, the slug, and points at the Autonomous Pipeline Policy in `CLAUDE.md`. States: work end to end, resolve every open question yourself and record each as a Resolved Decision, halt only on the stop conditions.
2. **Merge behavior line.** Every run opens its feature PR into `staging` and merges it into `staging` when the suite is green. It never merges into `main`. State a line only for an exception, such as "leave the feature PR open".
3. **Chain rules**, only if more than one pitch is chained (section 9).
4. **Pre-resolved decisions.** The real work. Section 4.
5. **Pipeline.** The fixed 15 steps with slots filled, including the conditional UI design gate at step 3. Section 5.
6. **Scope note on stop conditions.** Section 6.
7. **Required upstream amendments**, embedded in the owner-notes step so the PR description lists them.

Tell the human to copy **from the `## Pre-resolved decisions` heading down**. Everything above it is framing they paste first.

---

## 4. Producing the pre-resolved decisions

### 4.0 Check the standing resolutions first

Appendix D2 lists questions that cut across pitches and already have a settled answer or a proposed default. The values decided during MVP 1 live in the repository (the specs' Resolved Decisions and `docs/planning/method-note.md`), not in this guide, so read them there when a pitch depends on them. If a harvested item is one of them, adopt the standing resolution, cite Appendix D2, and move on. Do not re-derive it. Re-deriving is how two pitches end up with two different e1RM formulas.

### 4.1 Harvest

Read the pitch end to end and extract every place it leaves something undecided. Look for:

- An Open Questions or Source Gaps section.
- Phrases like "must be resolved before", "not specified", "unresolved", "requires a product decision", "belongs to design".
- Approximate quantities: "roughly", "near", "sustained", "repeated", "meaningful", "noticeable".
- Verbs with no defined object: "correct", "reconcile", "adjust".
- Contradictions: something listed In Scope that Out of Scope forbids, a Definition of Done item that a No-Go blocks, two sections giving different rules.
- Constants the pitch consumes from a document that does not contain them.
- Rabbit holes that name a problem without giving the fix. These are decisions waiting to be written.

Also read the **planning docs** and `docs/planning/architecture.md` → Open Questions for defects and gaps the pitch inherited. A planning doc that contradicts itself, or a data model that omits something the PRD requires, is a required upstream amendment.

### 4.2 Classify

Every harvested item lands in exactly one bucket.

| Bucket | Action |
| ------ | ------ |
| **A. The pitch already recommends an answer** | Adopt it. State that it is adopted. |
| **B. Derivable from existing docs or invariants** | Derive it and cite the source. |
| **C. A genuine numeric or mechanical gap** | Resolve with a conservative, explainable default. Flag it for human review in the report. |
| **D. The human's own risk appetite or a real-world consequence** | Do not resolve silently. Ask, or ship configurable defaults with an explicit human confirmation gate before the consequence becomes real. |

Bucket D is rare and important. For Overload it covers anything irreversible about the lifter's data, and anything that would change production data or credentials. If the human's earlier answers already cover it, treat it as bucket A.

### 4.3 Resolve: heuristics that have held up

- **Reuse an existing mechanism before inventing one.** One e1RM function, one set of progression constants, one soft-delete pattern, one place that writes a logged set. Two mechanisms doing the same job drift apart the first time one is changed.
- **Split fields by consequence of absence.** If missing data produces a silently wrong answer, make it required. If it only costs a capability, make it optional and say so at the point of entry.
- **Round in the safe direction.** Fewer corrections, higher thresholds, no tag over a weak tag, silence over a weak claim.
- **Make silent-failure rules structural.** Where a violation produces no error, enforce by construction, not by convention in a comment. A foreign key with `onDelete: Restrict` beats a code comment saying "don't delete this".
- **Declare, never infer, facts the system cannot know.** Overload cannot know a machine differs at a new gym, so the first log there establishes a baseline instead of guessing a correction.
- **One lifecycle instead of several.** Removal is archival. Editing something that carries history keeps the history. A mistake becomes a correction of the logged set, not a delete.
- **Missing is not zero.** "No history" is an explicit state, never a computed hold.
- **A recommendation never becomes an action.** Computing a progress or deload call never writes to the plan, the weights, or a goal.
- **When the pitch contradicts itself, the explicit boundary wins over recommendation prose.** Resolve it that way, then record a required roadmap decision for the thing that was deferred.
- **Pick round, explainable constants.** State why. Note it is configurable and flagged for review.
- **Never fabricate a citation.** Name an origin only when it is unambiguous. Otherwise state the claim as a population reference and add it to a references file for a human to verify.
- **Cite by feature name, not pitch number.** Numbers go stale when the roadmap is renumbered.

### 4.4 Write each decision

```
### N. <Title stated as the conclusion, not the question>

<Open Question n / Source gap n, if applicable.> <The resolution in one or two sentences.>

<Why this is the answer, written so the run can apply it to cases the pitch did not anticipate. Name the invariant it protects.>
```

Group decisions under a short lead paragraph explaining what they have in common (what the numbers mean, what the lifter is promised, which invariant governs). Close with the standing instruction: *treat these as approved doc authority; do not re-open, do not halt, and record each in the spec as a Resolved Decision citing this instruction.*

Add a trailing section for guidance that spans several questions rather than answering one ("On what this pitch must not compute", "On stale references").

### 4.5 What the generator must not do

- Do not re-open decisions the pitch states as approved.
- Do not set the human's risk appetite (bucket D) by default.
- Do not edit planning docs inside the run. Doc defects and required changes go in the owner notes as **required upstream amendments**, so a human applies them. The one exception is `docs/planning/method-note.md`, which a run may create and extend.
- Do not add libraries, services, schedulers, or infrastructure the architecture rejected (see `CLAUDE.md` → Stack for the list).
- Do not invent a stop condition. Use the project's.

If a decision's constants will be consumed by a later pitch, instruct the run to write them to `docs/planning/method-note.md` as part of the pitch, and to keep them as named constants in code. A constant that lives only in a prompt is lost at the first context reset.

---

## 5. The canonical pipeline block

Fill the slots. Keep the steps and their order. The pipeline has 15 numbered steps, and step 3, the UI design gate, is conditional.

**UI-bearing.** A pitch is UI-bearing when it creates, changes, or materially specifies any screen, page, component, interaction, form, list, navigation, user-visible state, or responsive behavior. Most Overload pitches are UI-bearing, including ones with a thin UI (a tag, a chart, a banner). The exception is a pitch with no screen at all, such as Multi-User Foundation, which is a data layer and a migration. Step 3 is mandatory for UI-bearing pitches. Scale the preview to the UI: a thin UI gets a small preview of exactly those surfaces and states.

**Not UI-bearing.** For a pitch with no UI surface at all, step 3 stays in the sequence and is recorded as "Skipped — no UI surface in this pitch" in the feature PR description. Never renumber later steps, because the owner notes and the resume prompt depend on stable numbers.

Decide which case applies before writing the prompt, and say so in the delivery note.

```
1.  Pull the pitch doc from Linear → <pitch-dir>/pitch.md, where <pitch-dir> is docs/pitches/<milestone>/<slug>/ and <milestone> is the phase the pitch sits under in docs/planning/pitch-roadmap.md. If that file already exists in the repo, use it.
2.  /overload-design-doc from that pitch → <pitch-dir>/design.md, including the feature's plan placement (Free, or a named Pro capability) and, once the iOS foundation exists, its platform impact
3.  UI design gate. If the pitch is UI-bearing, run /overload-ui-design in pipeline artifact mode, using the pitch and the completed design doc as inputs. Write the implementation-grade preview to <pitch-dir>/preview.tsx. It must cover the representative screens, states, interactions, and responsive behavior needed to set the visual contract for this pitch, and it must follow the design doc rather than invent product behavior. If the pitch has no UI surface, record "Skipped — no UI surface in this pitch" in the feature PR description and continue.
4.  /overload-spec from <pitch-dir>/pitch.md, <pitch-dir>/design.md, and (when step 3 ran) <pitch-dir>/preview.tsx → <pitch-dir>/spec.md. For a UI-bearing pitch the spec treats the preview as a binding input for hierarchy, interaction structure, responsive behavior, states, and visual system. It may add technical detail but must not silently redesign the interface. Once the tour and What's New exist, the spec also carries the design doc's User guidance section, and it carries the plan placement and platform impact.
5.  Resolve every remaining open question. Record them as Resolved Decisions alongside those above, in the spec's ## Resolved Decisions section.
6.  Divide the spec into medium-large PR-sized chunks. Create a milestone for this feature in Overload V1, turn the chunks into Linear issues on that milestone, and chain them with blockedBy in build order. Once the onboarding tour and What's New exist, make the last chunk a guidance ticket for any pitch with a visible change. The Linear milestone and its issues are the run's progress record, so there is no progress file.
7.  Open a feature PR into staging. Title and body describe the feature as a whole, not the docs.
8.  /overload-ticket-worker: work every ticket in order. The first branches off the feature branch; each subsequent one branches off the last. Open a PR for each and attach it to its Linear issue. A ticket moves to In Progress when its work starts and to In Review when its PR opens. Do not stop between tickets. For a UI-bearing pitch, read the pitch, design doc, UI preview, spec, and the overload-ui-design skill before implementing any UI. The preview is the visual contract: do not substitute a different layout because it is easier to build. For the guidance ticket, run /overload-onboarding to add or update tour steps and a release-note entry.
9.  Write the runbook to <pitch-dir>/runbook.md, covering everything needed outside the codebase, with steps — <pitch-specific list>. Put any SQL it needs in <pitch-dir>/sql/.
10. Squash and merge every ticket PR into the feature branch, in order, and move each ticket to Done in Linear as its PR is merged. A merged ticket must never be left in In Review.
11. Run the full verification suite on the feature branch — lint, typecheck, format, unit tests, integration tests, build<, plus the standing invariant tests from Appendix D4 that apply>. <Pitch-specific additions.> For a UI-bearing pitch, also verify that the implemented screens materially match the preview's hierarchy, visible controls, states, mobile behavior, and design system. For a pitch with a visible change, once the tour and What's New exist, also verify that its tour steps and release-note entry exist and work. A check that needs an iOS or Android build or a real device cannot be run by a run: report it as unverified and list the manual steps, never as passed. Runs use Stripe test mode only. All green is a precondition for continuing.
12. /review the feature branch against staging, leaving findings as inline comments on the feature PR you opened in step 7.
13. /overload-review-audit those comments. Implement what you mark implement. For defer, decide ticket vs. code comment. For discuss, go with your recommendation. Skip what you mark skip.
14. <Merge into staging — see below.>
15. Owner notes. Update the feature PR description and print the same as the final message: decisions made on the owner's behalf, required upstream doc amendments (bucket C constants included), anything unverified or undecidable, and, if halted, the stop condition and how to resume. Do not write a run report or a progress file.
```

The slug is the pitch's folder name, for example `04-guided-workout-logging`. All of the pitch's documents live in that folder: `pitch.md`, `design.md`, `preview.tsx`, `spec.md`, and `runbook.md`, plus `sql/` or `assets/` when needed.

**Step 14, merge into staging (the default):**

> Commit, push, re-run the full suite. If green, squash and merge the feature branch into `staging`. **Never merge into `main`.** If the suite is not green, halt and report, and never merge past a failing check. Routine development migrations and disposable test data on staging proceed without repeated dry runs.

**Step 14, leave the PR open (only when the owner asks):**

> Commit, push, re-run the full suite. **Stop here. Do not merge the feature branch.** Leave the feature PR open against `staging` with every ticket PR merged into it, the suite green, and the review audit applied. If the suite is not green, say so plainly in the report rather than presenting the branch as ready.

The default is to merge into `staging`, where the owner tests in the browser. Reaching Production is a separate step: after the owner approves the feature, a promotion prompt (Appendix E) cuts a release branch from `main`. Production is protected by that workflow, not by holding the feature back from staging.

**What each skill does**, for a generator unfamiliar with them:

| Skill | Role |
| ----- | ---- |
| overload-design-doc | Turns the pitch into screens, flows, states, hierarchy, and interaction rules. It defines what the UI must accomplish. UI/UX only; no schema. |
| overload-ui-design | Turns the approved design doc into a concrete, implementation-grade visual preview in Overload's brand system. A mandatory stage for every UI-bearing pitch, with its output at `preview.tsx` in the pitch folder. It also supplies the brand and visual rules the ticket worker follows. |
| overload-spec | Turns the pitch, design doc, and UI preview (when present) into data model, server actions, validation, tests, acceptance criteria, and UI implementation requirements. |
| overload-ticket-worker | Implements one Linear ticket: plan, test, build, verify, commit, PR. For UI work it consumes the design doc and the preview rather than redesigning from scratch. |
| overload-review-audit | Judges review comments for technical validity and scope, then recommends implement, defer, skip, or discuss. |
| overload-onboarding | Keeps the onboarding tour and release notes current: decides whether a visible change warrants a tour step, writes the step and the release-note entry, and applies them through the existing mechanisms. Used for the guidance ticket once the tour and What's New exist. |
| overload-cross-platform | Decides and records how a feature behaves on web, iOS, and Android (shared, native-specific, or web-only), applies the shell-compatibility checklist, and reports device checks honestly. Dormant until the iOS foundation ships. |

---

## 6. Writing the scope note

Heading: *Scope note on stop conditions.*

1. **Use the project's stop conditions, by their text.** Quote them from `CLAUDE.md` → Autonomous Pipeline Policy rather than citing a number from memory.
2. **Lead with the boundary most likely to be crossed by reasonable instinct**, not the most dramatic one. The risk is rarely a reckless shortcut. It is a sensible-sounding helpful addition: storing the tag "for performance", a cron job to keep tags fresh, a demo set so a screen is reachable, a policy added so a query works.
3. **Name two to four boundaries.** For each: what is tempting, why it looks reasonable, and that crossing it **is** a halt. Appendix D3 has a starting bank per pitch.
4. **Quote the pitch's own rabbit-hole language** when it already names the risk. A warning nobody enforces becomes a halt.
5. **End with the produce-versus-act sentence**: what this pitch produces for later pitches to consume, and the line it must not cross. ("Producing the progress tag is in scope; writing a new weight into the plan because of it is not.")

---

## 7. Verification additions

Step 11 always includes the project's standing checks. Then add **one named test requirement per pre-resolved invariant**, phrased as what must be provable:

- A test proving each structural rule from 4.3 holds, such as "attempting a hard delete of a referenced exercise is rejected by the database".
- A test for each silent-failure mode the pitch or the docs name.
- A test that the thing deliberately not built is unreachable (a missing route, a rejected parameter, an absent column).
- Adversarial cases first: the history-destroying write, the stale input, the retroactive edit, the anon-key request.

Appendix D4 lists the standing invariant tests and the first pitch each applies from.

---

## 8. Owner notes requirements

There is no run report and no progress file. Step 15 must make the feature PR description, and the final message, state:

- The PR link and the suite result, and whether the feature branch was merged into `staging`.
- Decisions made on the owner's behalf, each with a one-line rationale.
- **Required upstream amendments**, itemized: planning-doc defects found, renumbering, contradictions resolved, constants chosen. Every bucket C constant is listed here for human review.
- Anything unverified (especially device checks) and anything that could not be decided autonomously.
- If halted: which stop condition, at which step, and what is needed to resume.

The runbook is the only document a run writes for the owner.

---

## 9. Variants

**Chaining pitches.** Only chain pitches where the dependency is strictly linear and the vocabulary is shared. Never chain across unrelated areas, and run the heaviest pitch alone. Add a **Chain rules** block:

- The first pitch completes entirely before the second begins.
- A halt anywhere stops the chain.
- Treat the boundary as a fresh start: re-read `CLAUDE.md`, the planning docs, the first pitch's spec and report. Do not rely on what is still in context.
- Do not stack branches. The second pitch branches off `main` after the first merges. If the first pitch stops before merge, do not chain.
- Chaining forces every decision the second pitch needs to be made up front. Write them as a clearly labelled second part and have the run commit them to `docs/planning/method-note.md`.

Pitches run alone by default. The only reasonable chain is small, same-surface work, such as the Landing Page followed by its changelog.

**Resume after a context reset.** Appendix B.

**Interface-heavy versus engine-heavy pitches.** Say so in steps 2 to 4. Plans & Billing and Plan Import are engine-heavy: their specs carry the entitlement, webhook, and guardrail contracts with full rigor, and their UI is thin. The Admin Center, Public Accounts, and the Landing Page are interface-heavy: they need real design-doc treatment of hierarchy, states, and, for the public pages, honest presentation.

**A pitch that depends on constants from an earlier pitch.** Add a precondition: if those constants are not present in the repository (in code and in `docs/planning/method-note.md`) when the run starts, halt under the contradiction stop condition rather than inventing them.

---

## 10. Delivery note

After writing the prompt, tell the human, briefly:

- Which line to copy from.
- Whether the pitch is UI-bearing (so step 3 runs) or not (so it is recorded as skipped), and why.
- Whether the run merges into `staging` (the default) or leaves its PR open, and why.
- The two to four decisions most worth their review, with the reasoning in a sentence each.
- Any contradiction found inside the pitch or planning docs and how it was resolved.
- Which numbers are guesses rather than derived, so they can adjust them.

---

## 11. Quality checklist

Before sending, confirm:

- [ ] Every open question and source gap in the pitch is accounted for in a bucket.
- [ ] Every standing question from Appendix D2 was adopted, not re-derived, and cited.
- [ ] Every bucket C constant is explainable and flagged for review in the report step.
- [ ] No bucket D decision was resolved on the human's behalf.
- [ ] No pitch contradiction was left for implementation to notice.
- [ ] Planning docs are never edited by the run; defects are listed as amendments.
- [ ] Stop conditions are quoted from `CLAUDE.md`.
- [ ] The scope note leads with the boundary most likely to be crossed by instinct.
- [ ] Each invariant has a named test in step 11.
- [ ] Dependencies are named by feature, not pitch number.
- [ ] Paths, skill names, and Linear project match the profile.
- [ ] Merge behavior is stated and matches step 14.
- [ ] The pitch was classified as UI-bearing or not, step 3 matches that classification, and a UI-bearing pitch's prompt names the preview path in steps 3, 4, 8, and 11.
- [ ] Constants a later pitch needs are written to `docs/planning/method-note.md`, not left in the prompt.

---

## 12. Skeleton

```markdown
Run the full pitch pipeline for **"Overload — Pitch: <Title>"** in the Linear project **<Linear project>**, under the Autonomous Pipeline Policy in `CLAUDE.md`. Slug: `<slug>`.

Work end to end without stopping to ask. Resolve every open question yourself and record each as a Resolved Decision with its rationale. Halt only on the stop conditions defined in `CLAUDE.md`.

[**This run leaves its feature PR open instead of merging into `staging`.** <One-sentence reason.> Include this line only as an exception.]

---

## Pre-resolved decisions

<Lead paragraph: how many questions the pitch raises, how many are resolved here, and what they have in common.> Treat these as approved doc authority: do not re-open, do not halt, and record each in the spec as a Resolved Decision citing this instruction.

### 1. <Conclusion>
<Open Question n.> <Resolution.>

<Rationale and the invariant protected.>

### N. <...>

### On <spanning guidance>
<...>

### On required upstream amendments
Do not edit `docs/planning/` during this run, except `docs/planning/method-note.md`. Record each in the owner notes so a human applies it.

---

## Pipeline

<The 15 steps from section 5, slots filled. Step 3 is either the UI design gate or the recorded skip.>

---

## Scope note on stop conditions

<Section 6.>
```

---

## Appendix A. Autonomous Pipeline Policy

Overload's `CLAUDE.md` contains an "Autonomous Pipeline Policy" section. It is what the prompt's opening paragraph points at. It covers: the required artifact order for UI-bearing pitches (pitch, design doc, UI preview, spec), the admin boundary, plans and entitlements, plan import, and cross-platform rules, decide-don't-ask with an order of authority, the four stop conditions, verification honesty, how a run's state is recovered without a progress file, owner notes instead of a run report, Linear status, branching and merge behavior, ticket identifiers, operator tasks (such as seeding a friend's plan, which is not a pitch), and the user-guidance convention. It also says the interview and checkpoint steps inside the skills do not apply in an unattended run, and that resolved questions are recorded in the spec under `## Resolved Decisions`.

If the `CLAUDE.md` you were given has no such section, tell the human before generating a prompt. Do not write the policy into the prompt itself.

---

## Appendix B. Cold-start handoff prompt

Use when a run's context is exhausted and a fresh session must continue. There is no progress file, so the new session works out where the run stopped from its artifacts.

```markdown
Resume an in-flight pipeline in the Overload repository. You have no prior context; everything you need is on disk, in Linear, or in this message.

## Read first, before doing anything
1. `CLAUDE.md`
2. The planning docs in `docs/planning/`, including `method-note.md` if it exists
3. The pitch folder, `docs/pitches/<milestone>/<slug>/`: `pitch.md`, and whichever of `design.md`, `preview.tsx`, and `spec.md` exist

The Resolved Decisions in the spec are binding. Do not re-derive them or revisit them. If you disagree, note it in the owner notes and implement as recorded.

## Work out where the run stopped
Check in order, and resume at the first thing missing: design.md, preview.tsx (if the pitch is UI-bearing), spec.md, the Linear milestone and its issues, the feature PR into staging, each ticket's status and PR, the runbook, the verification suite, the review audit, the merge into staging, the owner notes.
Next action: <the first incomplete step>. Work the remaining tickets in order, a PR each, with no stopping between tickets, and keep Linear statuses current (In Progress, In Review, Done on merge into the feature branch).

## First action
<If any constants exist only in the original prompt, write them verbatim to docs/planning/method-note.md, commit, and push, before resuming any ticket.>

## Halt conditions
<The pitch's scope note, restated.>

## Required upstream amendments to list in the owner notes
<The running list.>
```

---

## Appendix C. Overload profile

| Slot | Overload |
| ---- | -------- |
| Linear project | Overload V1 (ticket prefix `OVE-`) |
| Planning docs | `docs/planning/` |
| Pitch folder | `docs/pitches/<milestone>/<slug>/`, holding `pitch.md`, `design.md`, `preview.tsx` (UI-bearing pitches), `spec.md`, `runbook.md`, and `sql/` or `assets/` when needed. The milestone folder is listed in the roadmap |
| Run documents | The runbook only. No progress file and no run report |
| Skills | `overload-design-doc`, `overload-ui-design`, `overload-spec`, `overload-ticket-worker`, `overload-review-audit`, `overload-onboarding`, `overload-cross-platform` |
| What it is | Strength training tracker for individual lifters, each with a private account, with a Free plan and a paid Pro plan. MVP 1 to 3 are shipped and it is moving from invite-only to a commercial launch. Next.js (App Router), Prisma, Supabase, Tailwind with shadcn/ui, Vercel, with Stripe, a custom SMTP provider, a language-model API, and Capacitor planned |
| Mutations | Server actions that call the write modules under `lib/`. No REST layer for the app's own UI |
| Core invariants | Account isolation: every owned row is scoped to the acting account by construction. Logged sets are the only source of truth. Derived values are computed on read and never stored. Gym baselines are written atomically with their set and scoped to one gym. Row-level security is deny-all on every table. The admin area never shows training content. A Free account never receives a Pro result. One backend and one training model across web, iOS, and Android |
| Stop conditions (in `CLAUDE.md`) | Invariant weakened (account isolation, logged history, baselines, RLS, signup gate, admin boundary, plan enforcement, card data); approved doc contradicted; irreplaceable-data or credential scope, including exposing one account's data to another, live Stripe keys, or any real charge; destructive or irreversible operation not named in the pitch |
| Default merge behavior | Merge into `staging` on green. Never into `main`. Production promotion is a separate release workflow (Appendix E) |
| Standing verification | lint, typecheck, format, unit tests, integration tests, build, the invariant tests in Appendix D4, and for UI-bearing pitches a check that the screens match the preview |

---

## Appendix D. Overload standing knowledge

### D1. Branching and merge rule

Overload has three stages. Production is `main`, connected to the Production Supabase project. Permanent staging is `staging`, connected only to the `overload-dev` Supabase project with a stable Vercel Preview URL. Feature branches start from `staging`. The full rule is in `docs/pipeline/branching-and-release-workflow.md` and `CLAUDE.md`.

**Every run merges into `staging` when the suite is green and never merges into `main`.** Staging is built for rapid development, so a run does not stop for approval on routine development migrations, disposable test data, or integration there. It stops at genuine Production boundaries instead.

Five things are never done by any run, whatever the pitch: merging or deploying anything into `main`, applying a migration to production, enabling public signup in production, switching Stripe to live mode or making a real charge, and releasing to a store. All are human steps. Enabling a paid AI provider or changing billing or production environment variables is also owner-approved.

A feature reaches Production only through the promotion workflow in Appendix E, after the owner has tested it on staging.

### D2. Standing resolutions

**Decided during MVP 1 to 3.** The progression constants, baseline margin, e1RM formula, test runner, and the multi-user decisions were each decided in their pitch's spec and live in code and, where needed, `docs/planning/method-note.md`. Read those. Do not re-derive them and do not rely on a value from an earlier version of this guide.

**Correction.** Password recovery and the email it needs were not built in the multi-user phase. They are built in Public Accounts.

**Commercial launch.** These cut across the pitches in that phase. Adopt them, cite this appendix, and do not re-derive. Bucket A means the owner approved it in the roadmap, B means derived from the docs, C is a default flagged for review in the owner notes, and D is the owner's own call, so ship a configurable default with a human confirmation gate or ask.

| Question | Standing resolution | Bucket | Owning pitch |
| --- | --- | --- | --- |
| Plans | Free (no ads, ever) and Pro. Capture, history, and export are Free and never gated. Pro is progression recommendations and their evidence, e1RM trends and stall detection, RIR in recommendations, Exercise History & PR Intelligence, and plan import | A | Plans & Billing |
| Pro price | $4.99 a month or $39.99 a year, configurable | A (owner may change) | Plans & Billing |
| Trial | 14 days of Pro from signup, no card. After it, or after a lapse, the account moves to Free with nothing lost | A | Plans & Billing |
| BLIZZY | 50% off the first 3 months of a subscription, applied at checkout, capped at 200 redemptions. The pitch verifies how Stripe counts months | A | Plans & Billing |
| Comped access | An entitlement source with a reason, an optional end date, and an audit entry, granted and revoked in the admin area. Not a role, never touches Stripe. Existing accounts are comped as founding members | A | Plans & Billing |
| Capabilities | Code checks named capabilities, never plan names, enforced on the server. New insight features default to Pro | A | Plans & Billing |
| Admin identity | A server-side allowlist of auth user ids in an environment variable. Not a database role. A non-admin gets not-found | B and C | Admin Center & Feedback |
| Admin privacy boundary | Account metadata and aggregate counts only. No training content, no impersonation. Every mutation writes an append-only audit entry | A | Admin Center & Feedback |
| Last-active date | Date only, updated at most once a day | C | Admin Center & Feedback |
| Suspension | An account status checked on every authenticated request | B | Admin Center & Feedback |
| Feedback categories | Bug, idea, question, other | C | Admin Center & Feedback |
| Signup mode | A server-side setting, invite or public, default invite | B | Public Accounts |
| Email verification | Required before a first checkout, not before signup | C | Public Accounts |
| Abuse protection | Rate limits plus a bot challenge, with Cloudflare Turnstile as the default | C | Public Accounts |
| Email provider | Resend over SMTP from a verified domain. Domain and DNS are human steps in the runbook | C, domain is D | Public Accounts |
| Password recovery | Same response for a known and an unknown email, and the link expiry is the sign-in system's default | B | Public Accounts |
| Data export | A downloadable JSON file of everything the account owns | C | Public Accounts |
| Stripe | Hosted Checkout and Customer Portal. Test mode in every run. Signature-verified webhooks recording each event by id. Entitlement computed from stored records | B | Plans & Billing |
| Grace period | 7 days after a failed payment, as a configurable constant | C, owner decision | Plans & Billing |
| Tax handling | Recorded in the pitch. Enable Stripe Tax only if the owner is registered | D | Plans & Billing |
| Plan import model | The Anthropic API, called from the server | C | Plan Import |
| Plan import limits | 20,000 characters of input, 5 imports per account per day, and a global monthly spend cap whose amount the owner sets | C, cap amount is D | Plan Import |
| Plan import retention | A draft is deleted when confirmed or discarded, and after 24 hours at most | C | Plan Import |
| Plan import format | The existing plan-seed format is the structured intermediate, once confirmed in the spec | B | Plan Import |
| Public pages | Routes in the same application under a public route group, first-party attribution only, no third-party analytics unless the pitch decides it | B and C | Public Landing Page & Changelog |
| Capacitor approach | Not predecided. The feasibility step in iOS Foundation decides and proves it on a device | Owned by the pitch | iOS Foundation |
| Store billing paths | Decided in the store release pitches. No purchase flow in a shell until then | B | App Store and Google Play releases |

If the pitch recommends a different answer, bucket A wins: adopt the pitch's answer and flag the difference in the owner notes.

### D3. Temptations to name in the scope note, by pitch

Lead with the first one listed for the pitch unless the pitch text points elsewhere.

| Pitch | Sensible-sounding boundaries a run will be tempted to cross |
| --- | --- |
| Admin Center & Feedback | Showing a lifter's workouts "to help with support". Making admin a database role or a flag an account can be given. Hiding navigation and calling it authorization. Building impersonation. An admin mutation without an audit entry |
| iOS Foundation | A purchase flow inside the shell. A second code path for mobile data. Branching on the platform in a caller instead of an adapter. Reporting a device check as passed |
| Public Accounts | Turning public signup on from the run. Using Supabase's built-in email sender. A recovery response that reveals whether an email has an account. Adding social login or email confirmation at signup. An export that includes another account's data |
| Plans & Billing | Branching on a plan name or enforcing only in the UI. Gating capture, history, or export, or deleting something when access ends. Handling card data. Using live Stripe keys. A webhook that does not verify its signature, is not idempotent, or trusts the payload to pick the account. Making comped access a role. Countdowns or banners in the upgrade note |
| Public Landing Page & Changelog | Real lifters' data in screenshots. Invented testimonials or fake scarcity. Third-party trackers. A call to action that promises billing before it is live |
| Plan Import | Calling the model from the browser. Treating pasted text as instructions. Saving before the lifter confirms. Generating a program. Accepting output that is not validated or does not trace to the pasted text. Skipping the usage limits |
| Launch Readiness & Closed Beta | Calling the checklist done without evidence. Turning on live payments or public signup from the run. Skipping the restore drill |
| Android Foundation | A separate Android data path. Branching on the platform in callers. A purchase flow in the shell |
| Gym Location | Always-on location tracking. Silently assigning a gym when detection is uncertain |
| Native Notifications | Engagement nudges, streak reminders, or guilt-based wording. Sending when there is nothing actionable |
| Live Activity and Watch | Full weight and reps entry on the Watch before the simple version is proven. A second workout state separate from the phone's |
| App Store and Google Play releases | A purchase path the store's rules do not allow. Submitting a wrapper with no native value |
| Body Metrics and Nutrition | Letting body data change a training recommendation. Pulling every available health metric |

### D4. Standing invariant tests, and where each applies from

Once a test applies, every later run keeps it green. The cross-account suite is extended for every new owned model.

| Test | Proves | Applies from |
| --- | --- | --- |
| Row-level security enabled on every table | No table is reachable through the public Data API | MVP 1 |
| Anon-key Data API returns nothing for every table | The deny-all posture works in practice | MVP 1 |
| Unauthenticated requests are redirected or rejected | Every route and server action is gated | MVP 1 |
| No `LoggedSet` write outside `lib/logging/logged-sets.ts`, archiving keeps history, hard deletes of referenced rows are rejected, no stored tag or e1RM column | The history invariants hold | MVP 1 |
| A baseline correction at one gym leaves another gym's unchanged, and a failed set leaves the baseline untouched | Isolation and atomicity | MVP 1 |
| The reactive check is suppressed in the scheduled deload week and resumes after | The two deload systems stay separate | MVP 1 |
| Cross-account isolation for every owned model, every owned model has an indexed `userId`, no owned-model query outside the allowed modules, and the acting account ignores client input | Account isolation | MVP 2 |
| Signup rejects a missing or wrong invite code while invite-only, and deleting an account removes only that account's rows | The access gate and safe deletion | MVP 2 |
| Every tour step's anchor exists at phone and desktop widths, and a new account has no unread release backlog | The tour and What's New behave | MVP 2 |
| A non-admin cannot reach any admin page or operation, admin responses contain no training content, and every admin mutation is audited | The admin boundary | Admin Center & Feedback |
| A suspended account is refused on its next request | Suspension is enforced | Admin Center & Feedback |
| A recovery request gives the same response for a known and an unknown email, and public mode on and off behave as specified | Recovery and the signup switch | Public Accounts |
| A Free account never receives a Pro result by any path, replaying a webhook changes nothing, a bad signature is rejected, and a downgrade deletes nothing | Plan enforcement and billing integrity | Plans & Billing |
| Plan import output is schema-validated, every item traces to the pasted text, nothing is saved before confirmation, and the usage limits and kill switch work | Plan import guardrails | Plan Import |

### D5. UI-bearing classification and the previews folder

Pitches with no screens record step 3 as "Skipped — no UI surface in this pitch": Android Foundation, Launch Readiness, and the store releases, and the iOS Foundation unless it adds a screen. Every other pitch on the roadmap is UI-bearing by the section 5 definition, so step 3 runs for it, including Admin Center & Feedback, Public Accounts, Plans & Billing, the Landing Page, and Plan Import.

Preview files (`docs/pitches/**/preview.*`) must not break the build. They are excluded from type-checking, linting, format checks, and the production build, because a preview may import shadcn/ui components the application has not built yet. A preview is self-contained: inline mock data, no data-layer imports, no network requests. If a run fails typecheck or lint on a preview, it halts under the contradiction stop condition and does not delete the exclusion.

## Appendix E. Production promotion prompt

When the owner says a feature is tested and approved on staging and asks to release it, do not use the pipeline. Produce the Production Promotion prompt from `docs/pipeline/production-promotion-prompt.md`, filling in the feature, PR, or ticket line, and give the owner the paste-ready prompt. It has five phases: identify the approved changes, prepare a release branch cut fresh from `main`, validate Production readiness, open a release PR into `main` without merging it, and stop at the Production boundaries. It ends with a final report and instructions for synchronizing `main` back into `staging`.

Rules for the generator:

- Never open a Production PR from `staging`. The release branch comes from the latest `main`.
- Passing staging tests is not approval for a Production migration, provider spending, or an external integration.
- If the approved change set cannot be isolated, or an approved migration depends on an unapproved one (Prisma migrations are ordered), the run stops and reports.
- Keep the prompt as written. Add only a feature-specific line when the owner asks, for example a required feature flag or a known Production dependency.

## Appendix F. Chore run prompt

Use for a small item that needs no pitch: copy changes, a small admin or display change, a one-screen tweak. A chore is one Linear ticket run straight through `/overload-ticket-worker`, with no design doc, preview, spec, runbook, or owner-notes file.

```markdown
Chore for Overload: <one-line description>. Linear ticket: OVE-<n>.

Read `CLAUDE.md`. Branch from the latest `staging`, implement the change with `/overload-ticket-worker`, run the applicable checks, open a PR into `staging`, and merge it when green. Move the ticket to In Progress when you start, In Review when the PR opens, and Done when it is merged. Never merge into `main`.

If the change touches the data model, plan gating, account isolation, privacy, or anything in the Production boundaries in `CLAUDE.md`, stop and say it should be a pitch instead.

Finish with the PR link and a two-line summary.
```

Turn a chore into a pitch when it needs a new screen with real design decisions, a schema change, or anything that changes what an account can see or do.

