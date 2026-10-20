# Overload — Pitch 12: What's New

> Verbatim copy of the Linear document "Overload — Pitch 12: What's New" (project Overload V1, doc `d52121df-bb1b-44b2-add0-debdf1906b12`, last updated 2026-10-20). Pulled by the autonomous pipeline run on 2026-10-20. Linear is the source; this file is the repository copy the design doc, preview, and spec trace to.

**Type:** Feature
**Status:** Planned
**Appetite:** M — Medium
**Depends on:** Account Ownership & Isolation; Accounts: Signup, Login & Password Reset
**PRD Feature:** What's New
**UI-bearing:** Yes

---

## 1. Problem

Overload is evolving from a single-user strength-training application into a product used by a small group of invited lifters.

As new features ship, the way people use Overload will change. Some releases introduce new capabilities, others improve existing workflows, and some fix behavior that previously produced incorrect or confusing results.

The original product owner knows what changed because they built the application. Other lifters do not.

Without a deliberate communication mechanism, users may never discover improvements that would benefit them. They may continue using an older workflow, overlook a newly available feature, or remain unaware that a previously unreliable behavior has been corrected.

Explaining every update individually to each friend is not sustainable as the product grows.

At the same time, Overload does not need an elaborate announcement platform.

A constant stream of notifications, promotional messages, or interruptive popups would conflict with its deliberately restrained training experience.

The product needs a lightweight way to answer two questions:

1. **What's changed since I last used Overload?**
2. **Where can I review previous updates?**

The experience must respect each account's history of seen updates, show important changes without repeatedly interrupting the lifter, and give every user a permanent place to review the release history.

It must also establish a maintainable release-note mechanism that future feature pitches can extend without repeatedly redesigning how updates are presented.

This pitch delivers that mechanism.

---

## 2. Appetite

**M — Medium**

This pitch has three closely related capabilities:

* A repository-maintained history of product updates.
* A modal that presents significant unseen updates.
* A permanent What's New page accessible from Settings.

It also introduces account-specific state recording which updates have already been shown.

Although the visible interface is relatively contained, several behaviors require care:

* Distinguishing significant releases from ordinary changes.
* Handling multiple unseen releases together.
* Remembering what each account has seen.
* Preventing new accounts from receiving a historical backlog.
* Avoiding repeated interruptions.
* Keeping release-note content easy to extend.
* Integrating with the existing onboarding-maintenance workflow.

These concerns are substantial enough for a medium appetite but do not justify a larger announcement or communications system.

The pitch must remain focused on communicating changes to the product.

It should not expand into push notifications, email marketing, user targeting, a content-management interface, or analytics about who reads announcements.

---

## 3. Value delivered

When this pitch is complete, Overload can communicate meaningful product updates without relying on the owner to contact each lifter individually.

A returning lifter sees a concise announcement when an important update has shipped since their last visit.

After dismissing the announcement, they are not shown the same release again.

They can visit Settings to review the full release history at any time.

A newly created account begins with the existing release history already considered seen, avoiding a backlog of announcements about features that were available before the lifter joined.

Future features can add release-note entries through a consistent repository-managed process.

Together with Onboarding Tour, this creates the foundation for keeping users oriented as Overload evolves.

---

## 4. Solution shape

### 4.1 Repository-managed release notes

Overload maintains release notes as content stored in the application repository.

Each release-note entry describes a product change that has shipped.

Entries are dated and distinguish updates significant enough for an automatic announcement from those intended only for the release-history page.

The repository is the source of truth for release-note content.

Release notes are not individually stored as database records for every account.

The account database stores only the information needed to determine which release notes an individual lifter has already seen.

The exact file location, content structure, and validation rules belong to the design/spec stages.

The mechanism should make adding a new entry straightforward and should not require editing the modal or release-history page whenever an update ships.

### 4.2 Release-note content

Release notes are written for lifters, not developers.

Each entry should explain the user-visible change in clear, concise language.

For example, an improvement to logging should describe how logging is now easier, not which internal component or database operation changed.

Entries should avoid unnecessary technical terminology.

A release note should communicate:

* What changed.
* Why it matters to someone using Overload, where explanation is helpful.
* Whether the change represents a significant enough improvement to warrant an automatic announcement.

The project's `overload-onboarding` skill already defines the intended writing conventions: short, factual updates in Overload's restrained voice, with one release-note entry per shipped pitch as the normal starting point.

This pitch establishes the content mechanism that the skill will maintain.

### 4.3 Significant versus ordinary updates

Not every release should interrupt the lifter.

Some updates introduce important capabilities or visibly change how Overload behaves. Those deserve an automatic announcement.

Other changes are smaller, such as minor presentation improvements or routine maintenance.

The release-note mechanism includes a way to identify entries that qualify for the modal.

**Significant entries**

These may appear automatically when the signed-in account has not yet seen them.

**Ordinary entries**

These remain accessible on the What's New page without necessarily generating an automatic interruption.

This distinction prevents release communication from becoming excessive.

The `overload-onboarding` skill provides the maintenance rubric for deciding which future changes warrant a significant entry.

The initial What's New implementation should establish the mechanism, not a new competing significance system.

### 4.4 Automatic What's New modal

When an authenticated lifter opens Overload, the application determines whether any significant release-note entries are unseen by that account.

If qualifying entries exist, a modal presents them.

The modal should communicate the updates clearly without overwhelming the current page.

It must have an obvious dismissal action.

Once dismissed, the presented release notes are remembered as seen and should not automatically appear again for that account.

The modal must not appear on every navigation, refresh, or sign-in when there are no newly qualifying entries.

Its purpose is to inform the lifter of meaningful changes, not to create repeated engagement prompts.

The design stage should determine the exact presentation, hierarchy, and dismissal interaction.

### 4.5 Multiple unseen releases

A lifter may not use Overload for several updates.

For example, someone could return after three significant changes have shipped.

The application must not force them through three separate announcements in sequence.

Instead, unseen significant entries are presented together in one consolidated modal experience.

This behavior is an explicit PRD edge case.

The combined presentation should remain readable on a phone.

The design stage determines how multiple entries are arranged within the modal.

The requirement is that the user receives one coherent update experience rather than a succession of interruptions.

### 4.6 Account-specific seen state

Overload remembers the latest release-note entry shown to each account.

This is part of the account's private application state.

It must persist across ordinary sessions and visits.

One lifter dismissing a release must not mark it as seen for another lifter.

The account-scoped state is separate from the repository-managed release-note content.

The existing Architecture Doc identifies `ReleaseSeen` as the account-owned object for this purpose.

The spec should follow that established architecture.

The exact read/write behavior and failure handling belong to the spec stage.

### 4.7 New account behavior

A newly registered lifter should not encounter a backlog of announcements about updates that shipped before they joined.

The project's standing resolution is:

**A new account starts with the latest existing release-note entry already considered seen.**

This ensures the lifter begins with the current product rather than being asked to read its entire development history.

The historical entries remain available on the What's New page.

Updates that ship after the account's starting point are handled normally.

This behavior also prevents the What's New modal from competing with the first-login Onboarding Tour.

### 4.8 Existing account behavior at rollout

When What's New launches, existing accounts must be handled consistently with the release-note content actually available at rollout.

The design/spec should distinguish between genuinely new significant updates and historical entries added as part of initializing the release-history mechanism.

Existing users should not be presented with a fabricated backlog of development history as though every historical change had just shipped.

The exact initialization behavior for accounts already present at rollout must be resolved in the spec using the project's existing account state, release-note data, and approved conventions.

This pitch does not authorize a synthetic release history or retroactively dated entries merely to populate the page.

### 4.9 What's New page

A permanent What's New page displays the release history.

It is accessible through Settings.

The page includes significant and ordinary release entries.

Entries are arranged in date order, with the most recent changes easiest to find.

The page should make it straightforward to understand how Overload has changed over time.

Unlike the automatic modal, this page is intentionally accessed by the lifter.

Visiting it should not require waiting for a new update or reopening a dismissed announcement.

The page is a read-only release history, not an editor.

### 4.10 Settings integration

Settings includes an entry point to the What's New page.

This should fit the existing account and application Settings experience established by earlier pitches.

Do not redesign the entire Settings area.

The design stage should determine the appropriate label, placement, and navigation behavior.

### 4.11 Light, dark, and responsive presentation

The modal and What's New page must use Overload's established visual system.

They should work in Light, Dark, and System appearance modes.

On smaller screens, the modal must remain readable and dismissible without obscuring access to its controls.

On desktop, the experience should feel consistent with the rest of the application.

The feature should use existing Tailwind and shadcn/ui primitives rather than introducing a separate announcement-component library.

### 4.12 Future release-note maintenance

Once this pitch ships, Overload has both parts of its guidance infrastructure:

* Onboarding Tour, introduced in Pitch 11.
* What's New, introduced in this pitch.

That activates the project's ongoing user-guidance convention.

Every later pitch that ships a visible change includes a final guidance ticket.

The ticket uses `/overload-onboarding` to:

* Decide whether the change warrants a new or updated tour step.
* Add or update tour content where warranted.
* Add the appropriate release-note entry.
* Verify both mechanisms continue working.

The maintenance skill uses the tour and release-note structures established by their controlling specs.

It must not create duplicate mechanisms.

This pitch establishes the second mechanism and enables that workflow for future features.

---

## 5. Primary user journeys

### Journey A — A returning lifter sees an important update

1. A significant Overload update ships.
2. The lifter opens Overload after the release.
3. The application identifies the signed-in account.
4. It determines that the significant release has not yet been seen.
5. The What's New modal appears.
6. The lifter reads the update.
7. They dismiss the modal.
8. The release is remembered as seen.
9. The lifter continues using Overload.

The same update does not automatically reappear on subsequent visits.

### Journey B — A lifter returns after multiple updates

1. Several significant updates ship while the lifter is away.
2. The lifter returns to Overload.
3. The application identifies multiple unseen significant entries.
4. One modal presents those entries together.
5. The lifter reviews the combined update.
6. They dismiss the modal.
7. The presented entries are remembered as seen.

The lifter is not forced through multiple consecutive modals.

### Journey C — A lifter reviews release history

1. The lifter opens Settings.
2. They select What's New.
3. The release-history page opens.
4. They browse previous entries in date order.
5. They can review both significant and ordinary changes.

The page remains accessible independently of whether an automatic update is currently pending.

### Journey D — A new lifter creates an account

1. A new account is created.
2. The existing release history is initialized as already seen for that account.
3. The lifter enters Overload.
4. No backlog of old updates appears.
5. The lifter can focus on the normal first-use experience.
6. They can still open What's New from Settings.

Later significant updates are presented normally.

### Journey E — A minor update ships

1. A small visible change is released.
2. Its release-note entry is classified as not significant.
3. The entry appears on the What's New page.
4. The lifter is not interrupted by a modal solely because of that entry.

This preserves the distinction between release history and automatic announcements.

### Journey F — A future pitch introduces a visible capability

1. A future feature pitch reaches its guidance ticket.
2. `/overload-onboarding` evaluates whether the new capability warrants a tour step.
3. The skill updates the tour when appropriate.
4. It creates the release-note entry.
5. It verifies the affected guidance mechanisms.
6. The feature ships with user guidance consistent with the current application.

The next visible-feature pitch does not need to invent how release notes work.

---

## 6. In scope

This pitch includes the PRD feature **What's New**, covering:

* Repository-maintained, dated release notes.
* A significance indicator for modal-worthy entries.
* Automatic display of significant unseen updates.
* Consolidation of multiple unseen significant releases.
* Per-account tracking of the latest seen release.
* Persistence of dismissal state.
* A permanent What's New page.
* Release history displayed in date order.
* A Settings entry point.
* New-account initialization without historical unread backlog.
* Responsive presentation in the existing design system.
* A stable content mechanism that future guidance tickets can extend.

The feature must be implemented end to end, including the visible experience, necessary state, content loading, and verification.

---

## 7. Out of scope

### Push notifications

No native or web push announcements of releases.

### Email announcements

No release newsletters, transactional update emails, or external email provider.

The previous removal of Resend and third-party email services remains respected.

### In-app release-note editor

Release content is maintained in the repository, not authored through an application administration screen.

### User-specific release targeting

No segmentation by individual lifter, account type, gym, training plan, or engagement status.

Significance is determined by the release entry, not personalized marketing rules.

### Engagement or marketing automation

No announcement scheduling system, messaging campaigns, reminder cadence, or promotional workflows.

### Analytics and read tracking

No analytics dashboard measuring announcement engagement, impressions, clicks, or individual reading behavior.

The only required account state is what Overload needs to avoid repeating seen updates.

### Rebuilding Onboarding Tour

Do not replace the tour, redesign its registry, or duplicate its guidance logic.

That mechanism was established by Pitch 11.

### Automatic changes to training behavior

Release notes describe product changes.

They must not alter workouts, plans, progression calculations, goals, logged history, or gym baselines.

### Public changelog website

This pitch provides a What's New page within the authenticated application.

It does not create a separate public marketing or release-notes website.

### General-purpose notification center

The release modal and history page are not the beginning of a unified notification inbox.

---

## 8. Definition of done

The formal acceptance criteria below trace directly to the PRD feature **What's New**.

### AC-1 — Significant unseen release appears once

A significant release-note entry that the account has not yet seen appears automatically.

After dismissal, that entry is not shown again automatically.

**PRD trace:** What's New — Acceptance criterion 1.

### AC-2 — Complete release history

The What's New page displays every release-note entry in date order.

The page includes both significant and ordinary updates.

**PRD trace:** What's New — Acceptance criterion 2, together with the feature description.

### AC-3 — No unread backlog for new accounts

A newly created account has no unread backlog of entries that existed before the account was created.

**PRD trace:** What's New — Acceptance criterion 3.

### AC-4 — Multiple unseen updates

When two or more significant entries remain unseen, they are presented together rather than as separate sequential modals.

**PRD trace:** What's New — Edge case / failure state.

### Additional roadmap completion conditions

The roadmap also requires that release notes are repository-maintained, accessible through Settings, and usable through a standard future maintenance convention.

These requirements are explicitly included in the PRD feature description but are not all individually enumerated as acceptance criteria.

They remain binding scope requirements.

The downstream spec should trace them to their actual source rather than presenting them as independently numbered PRD criteria that do not exist.

---

## 9. Rabbit holes

### 9.1 Showing updates more than once

A release modal may appear to work while accidentally reopening on refresh, navigation, or a new sign-in.

The account's seen state must reliably suppress repeated automatic presentation.

### 9.2 One modal per unseen release

Showing several sequential modals may appear simpler than building a consolidated view.

The PRD explicitly requires multiple unseen significant releases to be presented together.

Do not make users dismiss one popup after another.

### 9.3 Treating every release as significant

If every minor fix triggers the modal, lifters may begin ignoring announcements.

Significance must remain a meaningful distinction.

The full release history can include smaller changes without interrupting normal training.

### 9.4 Giving new accounts a backlog

New lifters should begin with the application as it exists today.

They do not need to acknowledge all the updates that happened before joining.

The standing resolution explicitly initializes new-account release state at the latest existing entry.

### 9.5 Introducing a content-management system

It may seem convenient to build a form for composing release notes inside Overload.

That would introduce new permissions, administration, editing behavior, and complexity.

Repository-managed content is sufficient.

### 9.6 Duplicating the onboarding mechanism

Once both guidance features exist, they should be maintained through their established registries and content files.

Do not add a second tour registry or a separate release-note format for future pitches.

### 9.7 Coupling announcements to notifications

A What's New modal is intentionally shown inside Overload.

It does not justify sending push notifications, emails, or reminders when releases ship.

### 9.8 Recording release notes before shipping

Release notes should describe actual shipped behavior.

The project's maintenance skill requires entries to use the shipping date and not to be backdated.

Do not invent a future shipping date or publish descriptions of features that are not yet available.

### 9.9 Exposing private account information

Release-note content is shared product information.

Seen-state records are private account information.

Do not introduce cross-account access merely because release-note content itself is common.

### 9.10 Overcomplicating the modal

The modal should explain meaningful changes and allow the user to continue.

Avoid promotional calls to action, elaborate animations, unnecessary steps, or controls that compete with the primary training workflow.

---

## 10. No-gos

* No email announcements.
* No Resend, SMTP, or other third-party email integration.
* No push notifications.
* No release-note editor or admin console.
* No per-user release targeting.
* No marketing automation.
* No analytics platform.
* No standalone notification center.
* No repeated modal for a dismissed release.
* No sequential modal queue for multiple unseen significant releases.
* No unread backlog for newly created accounts.
* No invented or backdated historical releases.
* No duplicate release-note registry.
* No modification of Onboarding Tour's core mechanism.
* No change to progression, logging, goals, or training history.
* No cross-account access to private seen state.

---

## 11. Dependencies

### Account Ownership & Isolation

The release-seen state belongs to one account.

This feature inherits the private ownership model and must preserve cross-account isolation.

### Accounts: Signup, Login & Password Reset

The feature requires authenticated accounts so it can identify whose seen state should be read or updated.

New-account initialization also depends on the established account-creation lifecycle.

The feature does not require password-recovery email delivery.

### Onboarding Tour

The roadmap does not list Onboarding Tour as a technical dependency for What's New.

However, in the current build sequence, Onboarding Tour is already the preceding pitch.

The What's New mechanism must remain compatible with the tour because both are maintained by the same future guidance workflow.

The release-note feature must not duplicate or rewrite the tour.

### Personalization & Navigation Polish

The existing Settings, responsive navigation, and appearance system provide the presentation environment for the new page and modal.

This pitch uses those established behaviors.

### Downstream dependency: Guidance maintenance

Once What's New and Onboarding Tour have both shipped, later visible-feature pitches can use `/overload-onboarding` to keep both mechanisms current.

The next visible-feature pitch, Faster Logging UX, should be the first to use the combined guidance-ticket workflow if both mechanisms have completed rollout.

---

## 12. Risks and verification focus

### Repeated interruption

A seen release must not repeatedly appear after dismissal.

The same account should receive the correct behavior across ordinary reloads and sessions.

### Release ordering

The application must reliably distinguish older entries from newly added ones.

The design/spec must establish a consistent way to order entries and identify which releases have been seen.

### Multiple unseen entries

A returning lifter must receive one combined announcement when several significant updates are pending.

The consolidation behavior requires explicit verification.

### Account isolation

Release-seen state must remain private to the account that owns it.

One user's dismissal cannot affect another user's release visibility.

### New-account initialization

New accounts must not receive old updates as unread.

This includes cases where the product has accumulated many releases before a new friend joins.

### Responsive presentation

The modal and full release-history page must remain readable and functional at phone and desktop widths.

Dismissal and navigation controls must remain accessible.

### Light and dark appearance

The new interface must respect the existing appearance preferences without introducing inconsistent visual styles.

### Content maintenance

Adding a new release-note entry should not require modifying the modal or page implementation.

Future guidance tickets should be able to update the approved content mechanism directly.

---

## 13. Open questions and source gaps

### Settled by project standing decisions

**New-account release backlog**

A new account starts with the latest existing entry already considered seen.

This is an approved standing resolution and should not be re-derived.

**Repository-maintained content**

Release-note entries live in repository content rather than account database rows.

This is established by the PRD and Architecture Doc.

**Per-account seen state**

The architecture identifies `ReleaseSeen` as the per-account record of the latest shown release.

Use that established model rather than inventing another notification-tracking system.

### Design-stage decisions

The exact appearance of the modal, hierarchy for multiple unseen releases, Settings entry point, and release-history page belong to `/overload-design-doc` and `/overload-ui-design`.

### Spec-stage decisions

The exact file location and structure of release-note entries, stable release identifiers, ordering behavior, account-state initialization, and handling of dismissal failures belong to `/overload-spec`.

These choices should follow existing repository conventions and the architectural requirements.

### Existing-account rollout

The supplied planning documents do not explicitly specify the initialization policy for existing accounts when What's New first ships.

The design/spec must resolve this without manufacturing historical unread announcements or modifying unrelated account state.

Record the decision as a Resolved Decision and identify its authority.

### Documentation maintenance

The spec must record the release-note content location and format in a way that the future `/overload-onboarding` skill can consume without guessing.

No additional product-level feature is required to accomplish this.

---

## 14. Rollout and delivery boundary

This is a UI-bearing pitch.

The required artifact sequence is:

**Pitch → Design Doc → UI Preview → Spec → Linear Tickets → Implementation**

### Design doc

`/overload-design-doc` determines the release-history experience, modal behavior, Settings entry point, responsive states, and appropriate User guidance considerations.

### UI preview

`/overload-ui-design` creates the implementation-grade preview of the significant-release modal, consolidated unseen-release state, and What's New page.

The preview must cover relevant phone, desktop, light, and dark presentations.

It becomes the visual contract for the spec and implementation.

### Spec

`/overload-spec` defines repository content conventions, seen-state behavior, account isolation, initial rollout handling, validation, and testing.

### Ticket implementation

`/overload-ticket-worker` implements the completed spec while respecting the UI preview.

The mechanism, UI, and account state belong to the same pitch.

### Merge behavior

The project's standing pipeline guide identifies What's New as **merge on green** by default.

This pitch is intended to add release communication and per-account seen state without altering logged history, authentication, or the established account-scoping system.

If implementation affects a protected area, including schema changes on tables holding user data, the pipeline must apply the corresponding stop-before-merge rule.

Production migrations remain human-operated in all cases.

### Guidance-skill behavior for this pitch

This pitch builds the What's New mechanism for the first time.

`/overload-onboarding` should **not** be used to create a separate maintenance guidance ticket during the initial construction of this mechanism.

It must not invent a substitute release-note format before the controlling spec exists.

Once the Onboarding Tour and What's New mechanisms are both shipped, the skill becomes applicable to subsequent visible-feature releases.

---

## 15. Handoff to design and spec

The following outcomes are fixed:

 1. Release notes are maintained in the repository.
 2. Entries are dated and distinguish significant from ordinary updates.
 3. Significant unseen entries trigger a modal.
 4. Dismissing the modal prevents those entries from appearing again automatically.
 5. Multiple unseen significant entries are presented together.
 6. Every release entry is available on the permanent What's New page.
 7. The page is accessible from Settings and displays entries in date order.
 8. Seen state belongs to the authenticated account.
 9. New accounts have no historical unread backlog.
10. The UI works on phone and desktop and respects existing appearance modes.
11. Future releases can add entries without changing the modal or page mechanism.
12. The mechanism integrates with the project's existing `/overload-onboarding` maintenance workflow after both guidance features have shipped.
13. No email, push notifications, administrative editor, marketing system, or unrelated training behavior is introduced.

The design stage determines how the user-facing experience looks and behaves within those requirements.

The spec stage determines how the approved behavior is implemented using the existing architecture.

**Completion outcome:** Overload informs returning lifters about meaningful changes once, keeps a permanent and readable history of updates, and establishes the release-note mechanism needed for ongoing feature guidance.

**End of pitch.**
