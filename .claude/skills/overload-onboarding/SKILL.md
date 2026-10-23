---
name: overload-onboarding
description: >
  Keep Overload's onboarding tour and release notes current as features ship. Use
  whenever a pitch or ticket adds, changes, or removes something a lifter can see or
  use, and whenever the user says "add this to the tour", "tour step", "onboarding
  step", "release note", "what's new entry", "guidance ticket", or "update the tour".
  Also use when writing the User guidance section of a design doc or spec. Decides
  whether a change warrants a tour step, writes the step and the release-note entry
  in Overload's voice, applies them through the existing tour and release-notes
  mechanisms, and verifies they work on phone and desktop. Does nothing until the
  onboarding tour and What's New have shipped.
---

# Overload Onboarding and Release Notes

Overload is used by individual lifters, each with a private account. Two things keep a new or returning lifter oriented as the product grows: the onboarding tour, which explains what each part does, and the release notes, which say what changed. This skill keeps both current.

It does not build either mechanism. The Onboarding Tour pitch builds the tour and What's New builds the release notes. This skill extends them, one visible change at a time.

## Before you start

1. **Check that the mechanisms exist.** Read `docs/specs/NN-onboarding-tour-spec.md` and `docs/specs/NN-whats-new-spec.md` (matching the roadmap's numbers and slugs for Onboarding Tour and What's New). If either feature has not shipped, do nothing for it and say so in your summary. Never build a stand-in.
2. **Learn the mechanism from its spec, not from guesswork.** Those specs record where the tour's step registry lives, the shape of a step, how a step anchors to a control, how existing lifters learn about new steps, and where release-note entries live and what fields they have. Follow them exactly. Do not invent a second registry, a second modal, or a second format.
3. **Read `CLAUDE.md`** for the rules that always apply, and `overload-ui-design` for the tour popover and What's New patterns.
4. **Read the pitch's design doc**, especially its User guidance section. It proposes the steps and the release-note entry. This skill decides, applies, and verifies them.

## Does the change warrant a tour step?

Add or change a step when the change:

- introduces a new screen, section, or control the lifter has to discover to benefit from it
- changes how a toured control works, so an existing step is now wrong
- removes or moves a toured control, so a step would point at nothing

Do not add a step for a bug fix, a copy tweak, a performance improvement, a change to something not on the tour, a new variant of something the lifter already understands, or anything internal. A tour that grows a step for every change turns into noise, and lifters stop taking it. A step for a Pro-only feature is warranted only if a Free lifter sees something to tour (its locked state is part of the interface). Otherwise leave it to the release note. When it is not clear, default to no step and record why. In an unattended run, record that as a Resolved Decision.

## Writing a tour step

- **Anchor to the real control.** The step points at the actual element on the actual screen, using the anchoring mechanism the tour spec defines. Never describe a control the lifter cannot see.
- **Work on phone and desktop.** On a phone the navigation sits in a sheet, so a step about a navigation item must either open the sheet or anchor to the control that opens it. A step whose anchor does not exist at the current size must be skipped by the mechanism, and you must not rely on that to hide a mistake.
- **Copy:** a short title and one or two plain sentences. Say what the control does and why the lifter would use it. Second person, present tense. Use the product's own words (mesocycle, session, deload, baseline). No emoji, no jokes, no marketing, no instructions to "simply" do anything.
- **Order follows the lifter's journey**, from today's workout outward, not the order the code was written.
- **Stable ids.** Give each step an id that does not change when the copy does.
- **Remove or update stale steps** in the same change that makes them stale.

## Writing a release-note entry

Use the fields and location the What's New spec defines. In general an entry has a date, a title, one to three plain sentences, and a flag for whether it is significant enough for the modal.

- **Write for the lifter.** Say what they can now do or what is different for them. Never mention Prisma, queries, migrations, or other internals.
- **Significant means the modal.** Flag an entry significant when it adds a capability, changes behavior the lifter will notice, or fixes a bug that affected the correctness of their data or recommendations. Cosmetic changes, small fixes, and internal work get no entry or a non-significant one.
- **Date it with the shipping date**, never a planned one. Do not backdate. Do not edit a published entry except to correct a mistake.
- **One entry per shipped pitch** is the default. Group small related changes into one entry rather than several.
- **If a tour step exists for the change**, link the entry to it where the mechanism supports that.

## Applying it

Make the change as data in the registry and the release-notes content, through the mechanisms' own files. Do not touch the tour component or the modal to add a step or an entry. If you find you have to, stop: the mechanism is missing something, and that is a finding for the report, not a reason to patch it here.

For a guidance ticket inside a pitch run, keep it to its own small ticket at the end of the pitch.

## Verifying

- Every step's anchor exists on the screen it names, at phone and desktop widths.
- The tour plays through in order with the new step in the right place, and a skipped or finished tour does not restart.
- The entry appears once for an account that has not seen it, and not again after it is dismissed.
- A new account sees no backlog of old entries as unread.
- The popover and modal look right in light and dark, and do not cover the control they describe.
- The copy is plain, short, and free of internals.

## Examples

**A new surface: Exercise History.** The pitch adds a per-exercise history view reached from an exercise. A step is warranted. Anchor it to the control that opens the view, title it "Exercise history", and write: "See how a lift has gone over time, including your best sets and why the app recommends what it does." The release entry is significant: "Exercise history: every lift now has its own page with recent sessions, trends, and personal bests."

**A change to behavior with no new surface: Faster Logging.** The pitch makes logging a set take fewer taps. No new surface, so no tour step, and the logging card step still reads correctly. The entry is significant, since lifters will notice: "Logging is faster: your last weight is filled in and you can repeat it across sets."

**A correctness fix.** A bug made a bodyweight exercise show a wrong recommendation. No step. The entry is significant, because it affected the correctness of what lifters were told: "Fixed a bug that could show a wrong recommendation on bodyweight exercises."

**An internal change.** A refactor with no visible effect. No step and no entry.

## In an unattended run

Decide, do not ask. If the design doc proposed a step that fails the rubric above, drop it and record the reason as a Resolved Decision. If it omitted one a new surface clearly needs, add it and record that too. Record whether the mechanisms existed.