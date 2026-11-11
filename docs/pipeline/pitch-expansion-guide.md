# Pitch Expansion Guide

You are a senior product engineer expanding a single pitch from a Pitch Roadmap into a complete, build-ready **pitch spec**. This document tells you how to do that using the four upstream planning documents, the product boundaries in `CLAUDE.md`, and `method-note.md` for constants earlier pitches recorded. The companion document `pitch-template.md` defines the exact output structure; this document defines the *process and judgment* for filling it.

**Where the output goes.** The finished pitch is stored in Linear. Step 1 of a pipeline run pulls it into `pitch.md` in its pitch folder, `docs/pitches/<milestone>/<NN-pitch-name>/`, where the milestone folder is the phase the pitch sits under in the roadmap (its table lists each folder name). Pitch numbers are permanent IDs, not the order of work, so cite pitches by feature name.

Read this fully before expanding a pitch. The quality of everything downstream — design doc, spec, tickets, build — depends on the pitch being scoped correctly and traceably.

---

## What a pitch is (and is not) in this pipeline

This pipeline runs: **pitch → design doc → UI preview (for UI-bearing pitches) → spec → tickets → build.** The pitch is the *first* stage, and it has a deliberately bounded job. Getting this boundary right is the single most important thing about pitch expansion.

A pitch **defines the shape of a bounded slice of work**: the problem it solves, the appetite (how much complexity is worth spending), the solution in broad strokes, what's explicitly out of bounds, and the risks that need attention. It gives the design-doc stage everything it needs to know *what* to design and *where the edges are* — without doing the design itself.

A pitch is **not** a technical design. It does not specify database schemas, API contracts, component hierarchies, function signatures, or ticket-level tasks. Those are the jobs of the design-doc, spec, and ticket stages that come *after*. If your expanded pitch contains a schema definition or an endpoint contract, you have overstepped the stage boundary and are duplicating work the design doc will redo.

The test: **a pitch tells the design stage what problem to solve and what's in and out of scope; the design stage decides how.** If a section is answering "how is this built," cut it and leave a pointer to the relevant Architecture Doc decision instead.

### One important adaptation

Classic Shape-Up pitches are speculative bets written *before* the product is fully known — rough solution sketches meant to be argued over and bet on. **These pitches are different.** They are generated *after* a complete PRD and Architecture Doc already exist, so they are not speculative bets — they are **scoped extractions** from an already-decided product. This changes your job:

- You are not inventing the solution from scratch; you are *extracting and bounding* a slice whose features, acceptance criteria, and technical foundations are already specified upstream.
- The solution shape is therefore more settled than a greenfield pitch's would be — but you still describe it as *shape*, not design.
- Your acceptance criteria are not invented here; they are **traced** from the PRD's acceptance criteria for the features this pitch includes.

You are applying Shape-Up's *shape* (appetite, boundaries, rabbit holes, no-gos) to an already-planned product, not making a greenfield bet.

---

## The four source documents and what each supplies

When expanding a pitch, you draw from all four planning docs. Each has a distinct role — know which doc answers which question so you neither miss context nor duplicate it.

- **Product Brief** — supplies the *why it matters* and the *north star*. Use it to write the pitch's problem statement in terms of the product's core job, and to sanity-check that the pitch actually serves that job. If a pitch can't be tied back to the core job, that's a flag. The Brief also defines Non-Goals — permanent scope boundaries the pitch must respect. A boundary changes only by an explicit amendment in the Brief, PRD, and `CLAUDE.md`, as the sharing pitches did for the old no-social rule.
- **PRD / Feature Breakdown** — supplies the *what*. This is your primary source. The pitch's included features come from here, named exactly as the PRD names them. The pitch's acceptance criteria are **traced** from the PRD's acceptance criteria for those features. The PRD's edge cases and failure states feed the pitch's rabbit holes and boundaries. The PRD's feature dependencies drive the pitch's stated dependencies.
- **Architecture Doc** — supplies the *technical ground truth to point at, not restate*. When the pitch needs to reference a technical decision (which auth model, which storage approach, the consistency model), point to the Architecture Doc's decision rather than re-deriving or re-specifying it. The Architecture Doc's "Biggest Technical Risk" often surfaces rabbit holes relevant to specific pitches.
- **Pitch Roadmap** — supplies the *pitch's identity and sequence*. The roadmap row you're expanding already states the pitch's type (foundational vs. feature), the value it delivers, what it includes, what it defers, its dependencies, and a definition-of-done sketch. Your expansion *deepens* this — it does not contradict it. If expansion reveals the roadmap's scoping was wrong, flag it rather than silently diverging.

- **CLAUDE.md and method-note.md** — supply the standing boundaries and constants. `CLAUDE.md`'s Product boundaries section lists what is never built and what is deferred. `method-note.md` holds constants earlier pitches recorded, which a pitch should consume and not reinvent.

The golden rule of consistency: **a feature named in the PRD carries the same name in the Roadmap and in the pitch.** Downstream agents trust the docs only because names are stable across all of them. Never rename a feature during expansion.

---

## Appetite: size by complexity, not time

Appetite is Shape-Up's core discipline: decide up front how much a slice is worth, and let that *fix the scope*. For a self-paced solo builder, express appetite as **complexity size — S / M / L — not a time box.**

- **S (Small)** — a contained, well-understood slice with few moving parts and little unknown. One clear capability, minimal integration surface.
- **M (Medium)** — several interacting parts, or one part with real unknowns. The typical feature pitch.
- **L (Large)** — substantial surface area or genuine technical uncertainty. Consider whether it should be split before expanding.

Appetite *constrains* scope, it doesn't merely describe it. If, during expansion, an S-sized pitch is accumulating the moving parts of an M or L, that is a signal — either cut scope to fit the appetite, or consciously re-size it and note why. A pitch whose scope is quietly outgrowing its appetite is the most common failure mode; catch it here, not during the build.

If a pitch is genuinely L and divisible, prefer proposing a split back to the roadmap over expanding a too-large pitch. Vertical splits (each slice ships user value) beat horizontal ones (each slice is a technical layer).

### Sizing lesson from real builds: a pitch is a vertical slice built end-to-end

A hard-won lesson from actual build experience, important enough to state on its own: **when an agentic coding tool builds a feature, it builds the full vertical slice — backend and frontend together — in one pass.** This has two consequences for how you size and split pitches:

- **Never split "the data/backend layer" from "the view/UI that sits on it" into two pitches.** Building the feature *produces its view*. A pitch scoped as "the data layer for X" and a separate pitch scoped as "the UI for X" will collapse into one during the build — the second pitch arrives already done. This is a real failure mode observed in practice: later pitches turned out to be already-complete because an earlier pitch's end-to-end build had produced them. Scope each pitch as a complete vertical capability, not a horizontal tier.
- **Do not promote 1–2 tickets into their own pitch.** If a "pitch" is really just an add-on to a page or feature that another pitch already builds (a filter on an existing list, a small toggle, a single extra field), it is not a pitch — it belongs *inside* the pitch that builds the surface it lives on. A pitch is a coherent slice of user value, not the smallest possible unit of work.

The exception that proves the rule: a genuine **foundation** (auth, a data-model/isolation substrate, deployment scaffolding) can be its own pitch even though it isn't a user-facing vertical slice — because it is the ground everything else is built on and often must be *verified* before dependent features are built on top of it. That is different from horizontally splitting a single feature's backend from its frontend. Isolate foundations; never bisect features.

---

### Chores and discovery pitches

- **Chores are not pitches.** Small items (a copy change, a small display or admin tweak, a one-screen adjustment) run as a single ticket through the chore prompt, with no pitch, design doc, or spec. If something you are asked to expand is that small, say so and leave it as a chore. If a chore turns out to need a new screen with real design decisions, a schema change, or a change to what an account can see or do, it becomes a pitch.
- **Discovery-first pitches.** Some roadmap pitches are marked discovery first (advanced cardio, video attachments). Their pitch scopes the discovery and the decision it must produce, such as which data source to use, what it costs, and what privacy it implies. The build is outside that pitch's scope until the decision is approved. Name the decision gate in the definition of done.

## The expansion process

For the pitch you're expanding:

1. **Read the roadmap row** for this pitch — its type, value, includes, defers, dependencies, and DoD sketch. This is your scaffold.
2. **Pull the included features from the PRD.** For each, gather its behavior, its acceptance criteria, and its edge cases. These become the substance of the pitch.
3. **Anchor the problem in the Brief.** State what user problem or core-job need this slice serves, in the product's own vocabulary. If you can't, flag a possible scope-creep issue.
4. **Set the appetite.** Judge S/M/L from the complexity of the included features and their unknowns. Note if it strains the roadmap's implied sizing.
5. **Describe the solution shape** — the broad approach, in user-facing and behavioral terms, pointing at (not restating) the Architecture Doc for any technical decisions the shape rests on. Also state three things the later stages depend on: whether the pitch is **UI-bearing** (it creates, changes, or materially specifies any screen, interaction, or user-visible state, which most pitches do), its **plan placement** (Free, or a named Pro capability: capture, history, and export are always Free, and new insight features default to Pro), and its **client scope** (web, mobile, or both; once the mobile app exists, a feature for both clients is built in one run). The slices of Pitch 21 are defined in `docs/planning/mobile-roadmap.md`, so expand a slice from there, not from scratch.
6. **Draw the boundaries.** State explicitly what's out of scope for this pitch — pulling from the roadmap's "defers," the Brief's Non-Goals, `CLAUDE.md`'s Product boundaries, and your own judgment about where this slice ends and the next begins.
7. **Trace acceptance criteria from the PRD.** The pitch's definition of done must map, criterion by criterion, to PRD acceptance criteria for the included features. Do not invent new criteria; if the PRD is missing one the pitch clearly needs, flag the gap rather than silently inventing.
8. **Identify rabbit holes and no-gos.** Surface the risky unknowns, the edge cases that could balloon scope, and the tempting-but-out-of-scope directions to consciously avoid. The PRD's edge cases and the Architecture Doc's technical risk are prime sources.
9. **State dependencies.** Which prior pitches must ship first (from the roadmap's dependency map), and any external prerequisites.
10. **Close with open questions.** List every decision the pitch leaves open, as its own Open Questions section. The pipeline's run prompt resolves these on the owner's behalf, so each must be visible. Mark any that are the owner's own call (money, legal, tax, privacy tradeoffs, anything irreversible about people's data), because those are never decided silently.
11. **Check consistency.** Names match the PRD/Roadmap; nothing contradicts an approved doc; scope fits appetite; every acceptance criterion traces upstream.

---

## Consistency and critique during expansion

You are not a passive formatter. As you expand, actively protect quality:

- **Trace, don't invent.** Every acceptance criterion should trace to a PRD criterion. If you find yourself writing a criterion with no upstream source, stop — either it belongs to a different pitch, or it's a genuine gap in the PRD worth flagging to the user.
- **Respect the stage boundary.** If you're specifying *how* something is built (schema, endpoints, components), you've crossed into design-doc territory. Pull back to shape and point at the Architecture Doc.
- **Catch scope outgrowing appetite.** If an S pitch is becoming an L during expansion, say so explicitly rather than quietly expanding.
- **Check the slice is vertical, not horizontal.** If the pitch you're expanding is scoped as a technical layer (a backend without its view, or a view without its backend), or is really just a 1–2 ticket add-on to a surface another pitch builds, flag it — it should be merged into a full vertical slice or into the pitch that owns its surface. The only legitimate non-vertical pitch is a genuine foundation (see the sizing lesson above).
- **Flag roadmap/PRD conflicts.** If expanding this pitch reveals that the roadmap sequenced it wrong, or that a dependency is missing, or that two pitches overlap, name the conflict — don't paper over it.
- **Respect Non-Goals.** The Brief's Non-Goals and `CLAUDE.md`'s Product boundaries are permanent until amended. A pitch must never include work they exclude, and a pitch that needs a boundary changed must say so as an explicit amendment, not slip it in.

Keep critique constructive and specific. The goal is a pitch the design-doc stage can consume with zero ambiguity about what's in, what's out, and what to watch for.

---

## Definition of "expanded enough"

A pitch is ready to hand to the design-doc stage when:

- Its problem is stated in terms of the product's core job.
- Its appetite is set and its scope visibly fits that appetite.
- Its solution shape is clear enough to design against, without doing the design.
- Its boundaries are explicit — a reader knows exactly what is out of scope.
- Every acceptance criterion traces to a PRD acceptance criterion.
- Its rabbit holes and no-gos are named.
- Its dependencies are stated and consistent with the roadmap.
- Names are consistent with the PRD and Roadmap throughout.
- Its UI-bearing status and plan placement are stated.
- Its open questions are listed, with the owner's own calls marked.

If all of that holds, stop. Do not over-specify into design territory. The next stage exists to do the design; the pitch's job is to make that stage's job unambiguous.
