<!-- Verbatim copy of the Linear document "Overload — Pitch 17: Admin Center & Feedback" (21bebdeb-a57e-4f5e-9408-ccd2c81801fb), pulled 2026-10-22 for the autonomous pipeline run. Linear is the source; this copy is what the run read. -->

# Overload — Pitch 17: Admin Center & Feedback

**Type:** Feature
**Status:** Planned — Next
**Phase:** MVP 4 — Commercial Launch & Operations
**Appetite:** M — Medium (proposed; not fixed by the roadmap)
**Depends on:** MVP 3 — Training Intelligence, complete and in production
**UI-bearing:** Yes
**Platform:** Web-only
**Plan placement:** Free — feedback and account administration are not Pro capabilities
**Merge behavior:** Stop before merge, as required by the updated pipeline guide for privileged admin surfaces

---

## 1. Problem

Overload has completed its first three MVPs.

It now has a functioning strength-training product, multiple private accounts, an onboarding experience, and an increasingly capable training-intelligence system.

The next goal is different.

Overload is moving from an invite-only application used by the owner and friends to a commercial product that strangers can discover, use, and eventually pay for.

Before opening the product, the owner needs a reliable way to operate it.

Currently, the owner does not have a dedicated administrative interface for understanding account activity, managing account access, or reviewing feedback from lifters.

As more people join, several practical questions become difficult to answer:

* How many people have signed up?
* How many have used Overload recently?
* Are people creating training plans?
* Are people actually logging workouts?
* Are newly registered users returning?
* Which accounts are active or suspended?
* How can an account be suspended or reactivated?
* Where can lifters report bugs, ask questions, or suggest improvements?
* How can the owner tell which administrative actions have been performed?

Without an administrative interface, answering these questions may require manual database inspection or direct communication with individual users.

That approach does not scale well and creates unnecessary operational risk.

However, introducing an admin area also creates a new and particularly sensitive security boundary.

Overload's existing account-isolation model guarantees that one lifter cannot access another lifter's private training information.

The owner must not gain unrestricted access to that content simply because they operate the product.

The admin experience therefore needs to support account operations **without becoming a back door into private training data**.

The problem this pitch solves is:

**Give Overload's owner the minimum useful tools to operate a growing product, while protecting the privacy and integrity of every lifter's account.**

---

## 2. Appetite

**M — Medium (proposed)**

The feature contains several closely related capabilities:

* Owner-only administrative access.
* Account lookup and management.
* Account suspension and reactivation.
* Account deletion through the established account-deletion mechanism.
* Basic product-operation metrics.
* An in-app feedback form.
* An owner-facing feedback inbox.
* An append-only administrative audit log.

The principal challenge is not the number of screens.

It is enforcing the separation between owner operations and private user training data.

Administrative authorization cannot rely on hidden navigation, client-side state, or a self-assigned database role.

Account suspension must be enforced throughout authenticated application access.

Aggregate metrics must be accurate without exposing individual training records.

Every administrative mutation must be auditable.

This work should remain one bounded feature. It does not justify introducing a broader business-intelligence platform, customer-support system, billing console, or unrestricted database administration interface.

---

## 3. Value delivered

When this pitch is complete, the owner has a secure place inside the web application to understand and operate Overload.

The owner can inspect account metadata, see how the product is being used at an aggregate level, suspend or reactivate an account, access the established account-deletion capability within its approved safety boundaries, and respond operationally to feedback.

Every administrative action leaves an audit record.

Meanwhile, lifters can submit feedback without leaving the application.

Ordinary accounts cannot access administrative pages or invoke administrative operations.

The owner can understand whether people are using Overload without reading their workouts.

The result is an operational foundation for the following commercial-launch features: public account creation, paid subscriptions, promotions, and broader customer support.

---

## 4. Solution shape

### 4.1 Owner-only admin area

Introduce a dedicated administrative area within Overload's web application.

Only authorized owner accounts can access it.

The updated Architecture Doc and `CLAUDE.md` establish the authorization boundary:

* Administrative identity is determined on the server from an allowlist of authenticated user IDs.
* The allowlist is held in a server-only environment variable.
* Administrative access is not a database role.
* An ordinary account cannot obtain administrative privileges through an application setting or account field.
* Every administrative operation performs its own server-side authorization check.
* Hiding navigation is never sufficient authorization.
* A non-admin who requests an administrative route or operation receives not-found behavior.

The administrative area is deliberately **web-only**.

There is no requirement to create corresponding administrative screens inside the future iPhone or Android applications.

The design stage should determine how authorized owners discover and navigate the area while preserving the existing application experience for ordinary lifters.

### 4.2 Account directory

The admin area provides an account list and lookup experience.

The owner needs to identify an account and understand its operational status without inspecting its private training content.

The account directory includes the metadata identified by the roadmap:

* Name.
* Email.
* Signup date.
* Account status.
* Last-active date.
* Whether the onboarding tour has been completed.
* Plan and entitlement information once the billing and entitlement system exists.

The existing authentication and profile systems remain authoritative for account identity.

The owner should be able to find a specific account without searching the underlying database manually.

The design stage determines the list structure, lookup interaction, and relevant empty or error states.

**The directory must not display training plans, gyms, logged sets, goals, cardio records, or other training content.**

This remains true even when the owner is inspecting a specific account.

### 4.3 Account detail and operations

Selecting an account allows the owner to inspect its administrative information and use the account-management actions authorized by this pitch.

The account detail experience should remain focused on operational metadata.

The owner may need to understand when the account was created, whether it is currently active, and whether it has been suspended.

The experience must not become an alternate user dashboard.

It must not allow the owner to open that lifter's training plan, exercise history, workout cards, strength goals, or gyms.

No account impersonation is included.

### 4.4 Account suspension

The owner can suspend an account.

A suspended account must no longer be able to use authenticated Overload functionality.

Suspension is an application access restriction, not an automatic deletion of training history.

The roadmap explicitly requires suspension to take effect on the account's **next authenticated request**.

An account that already has an authenticated session must not remain fully operational merely because it signed in before suspension.

The existing architecture specifies an account status of active or suspended, with suspension enforced throughout authenticated access.

The downstream spec must follow this established model.

Suspension must not silently delete or alter the account's training data.

The operation must be audited.

### 4.5 Account reactivation

The owner can reactivate a suspended account.

Reactivation restores the account's ability to use Overload under its existing authentication and account rules.

It does not create a new account, replace its training history, or reset its personal preferences.

Any future paid entitlement remains a separate concern governed by the billing system.

The operation must be audited.

### 4.6 Administrative account deletion

The roadmap includes owner-initiated account deletion as an administrative action.

The intended user-facing capability is to identify an account and request deletion through the application's established account-deletion module, with explicit confirmation.

It must not introduce a second independent deletion pathway.

Deletion is materially different from suspension because it permanently removes account data, including irreplaceable training history.

The existing data-integrity and account-isolation guarantees must remain intact.

**Important source conflict:** The updated roadmap explicitly includes administrative deletion, while `CLAUDE.md` still describes account deletion as user-initiated and identifies its existing module as the only sanctioned deletion path.

This pitch preserves the roadmap's requested administrative deletion capability but does not assume that the older module can already be invoked safely by an administrator.

The precise authorization and deletion contract must be reconciled with the existing controlling specification before implementation.

A shortcut that bypasses the established deletion module is not acceptable.

Every permitted administrative deletion must be confirmed and audited.

### 4.7 Aggregate operating metrics

The admin area contains a compact overview of how Overload is being adopted and used.

The initial metrics are limited to those identified by the roadmap.

**Registered accounts**

The total number of registered accounts.

**Active accounts — last 7 days**

The number of accounts active within the recent seven-day period.

**Active accounts — last 30 days**

The number of accounts active within the recent thirty-day period.

**New accounts this month**

The number of accounts created during the current reporting month.

**Accounts with a training plan**

The number of accounts that have created a plan.

**Accounts with logged workouts**

The number of accounts that have recorded a workout.

**Signup-cohort return rates**

An aggregate view of whether accounts registered during a given period subsequently return.

These metrics are intended to answer practical business questions about account adoption and continued use.

They are not a request for detailed workout analytics.

### 4.8 Metrics privacy boundary

The updated architecture requires a dedicated administrative metrics layer.

That layer computes aggregate operating information and returns counts or aggregate rates rather than individual training content.

For example, it may determine how many accounts have created a training plan.

It must not return those plans.

Likewise, it may determine how many accounts have logged a workout without returning their performed sets, exercise names, weights, or session details.

The admin interface must not receive private training data and merely hide it visually.

**The privacy boundary applies to the server response itself.**

The spec stage should determine the metrics-layer contract, query restrictions, and static checks required by the architecture.

Those details are deliberately not prescribed in this pitch.

### 4.9 Last-active tracking

The account directory and operating metrics depend on knowing when an account was last active.

The architecture defines this as a **date-only** value on the account profile.

The pipeline guide establishes a conservative standing default of updating it at most once per day.

This is not a continuous online-presence system.

Overload does not need live status indicators, session tracking, or detailed records of every page visit.

The downstream spec should settle the precise update behavior using the approved account lifecycle and record the decision.

The implementation must not weaken account isolation or introduce unnecessary activity monitoring.

### 4.10 Signup-cohort retention

The owner needs a basic indication of whether people return after creating an account.

Signup-cohort return rates should help answer questions such as whether people who registered during a recent period are using Overload afterward.

The presentation should remain simple and aggregate.

This is not a full analytics platform.

The exact cohort grouping and return-rate definition belong to the spec, using the available signup and last-active information.

Any limitation arising from date-only last-active tracking must be acknowledged.

Do not manufacture precision that the stored information cannot support.

### 4.11 In-app feedback form

Every authenticated lifter can submit feedback from inside Overload.

Feedback provides a direct way to report a problem, suggest an improvement, or ask a question.

The feature should be lightweight and easy to find.

The pipeline guide provides the following standing default categories:

* Bug.
* Idea.
* Question.
* Other.

The lifter can select a category and enter a message.

The form should confirm when the submission has been accepted and handle submission failures clearly.

It should not require a subscription.

Feedback is available on the Free plan and remains available to accounts with Pro access.

The feedback form must not become a public conversation or social feature.

### 4.12 Feedback inbox

The owner has an administrative inbox for reviewing feedback.

Each entry provides the information needed to understand the submitted message, identify its category, and determine whether it has been handled.

The owner can read an entry and mark it handled.

The roadmap calls for reading, categorizing, and marking feedback handled.

The underlying architecture defines feedback with a category, message text, date, and handled flag.

The design/spec stages should determine the precise inbox organization and any supported category-management interaction within that model.

The inbox does not introduce threaded conversations, assigned support agents, internal notes, or a complete ticketing system.

Those capabilities are explicitly deferred.

### 4.13 Feedback privacy

A feedback message is intentionally submitted to the product owner.

It is therefore distinct from private workout content.

However, that does not authorize the admin area to retrieve additional data about the sender's training.

The inbox may display the submitted message and the account metadata needed to associate it with the sender.

It must not automatically attach the lifter's training plan, recent workouts, logged sets, goals, or gym information.

No general-purpose private-account inspection is introduced.

### 4.14 Administrative audit log

Every administrative action must create an append-only audit record.

The updated architecture identifies `AdminAuditEntry` as the object responsible for recording:

* Who performed the action.
* What action was performed.
* Which account was affected.
* When it happened.

The purpose is accountability.

The owner should be able to review administrative actions and understand what changed.

The audit log must not be editable as an ordinary application record.

Actions such as suspension, reactivation, and permitted administrative deletion require audit entries.

The future comp-access controls also depend on this audit foundation, but are not implemented in this pitch.

The spec should define how audit persistence interacts with successful and failed administrative actions, especially destructive ones.

The log must not contain unnecessary training content or credentials.

### 4.15 Future billing compatibility

The admin directory will eventually show plan and entitlement state.

However, billing does not exist yet.

That capability belongs to **Plans, Billing & Promo Codes**.

This pitch should establish an administrative interface that can accommodate future account-plan information without creating placeholder payment records or a mock billing system.

The later billing pitch adds:

* Read-only visibility of subscription state.
* Promo-code redemptions.
* Owner-granted complimentary Pro access.
* Revocation and expiry of complimentary access.
* Audit entries for entitlement changes.

None of those controls should be implemented prematurely.

Billing state remains authoritative in the payment provider once that system exists.

The admin interface will not directly edit Stripe subscription state.

### 4.16 Interface character

The admin interface should feel consistent with the existing Overload design system.

It is an operational tool, not a public-facing marketing dashboard.

The design should prioritize legibility, efficient account lookup, clear administrative states, and deliberate treatment of consequential actions.

Aggregate metrics should be understandable without requiring complex charts.

Account actions should be clearly distinguishable from ordinary navigation.

Feedback should be readable and manageable.

The exact screens, layouts, hierarchy, responsive behavior, and confirmation interactions belong to the design and UI-preview stages.

---

## 5. Primary user journeys

### Journey A — Owner opens the admin center

1. The owner signs in to Overload.
2. The application determines administrative eligibility from the server-side allowlist.
3. The owner enters the admin area.
4. They see the operating overview and available administrative destinations.
5. They navigate to accounts, metrics, feedback, or audit history.

The experience does not reveal individual training content.

### Journey B — A normal lifter attempts administrative access

1. A non-admin signs in.
2. They attempt to open an administrative URL directly.
3. The application responds as though the administrative destination does not exist.
4. They attempt to invoke an administrative server operation directly.
5. The operation is rejected under the same authorization boundary.

The lifter cannot obtain administrative access by changing a client-side request or account setting.

### Journey C — Owner finds an account

1. The owner opens the account directory.
2. They look up an account.
3. The directory presents the permitted account metadata.
4. The owner inspects signup, status, and last-active information.
5. They may proceed to an authorized account action.

No workout history, plan, gym, goal, or cardio content is exposed.

### Journey D — Owner suspends an account

1. The owner locates the account.
2. They choose the suspension action.
3. The application performs the required authorized operation.
4. The account becomes suspended.
5. The action is recorded in the audit log.
6. The affected account's next authenticated request is refused.

The account's training history remains intact.

### Journey E — Owner reactivates an account

1. The owner locates a suspended account.
2. They choose to reactivate it.
3. The account status is restored.
4. The action is audited.
5. The user can access Overload again under the ordinary authentication rules.

Their historical training information remains unchanged.

### Journey F — Owner requests account deletion

1. The owner opens an account's administrative details.
2. They request deletion.
3. The application requires explicit confirmation.
4. The existing dedicated deletion mechanism is used under the authorization rules established by its controlling specification.
5. The operation removes only the intended account's data.
6. The administrative action is auditable.

This journey cannot be considered implementation-ready until the user-initiated deletion rule and roadmap's administrative deletion requirement have been reconciled.

### Journey G — Owner reviews product activity

1. The owner opens the administrative overview.
2. They see registered and recently active account counts.
3. They inspect new signups and basic adoption indicators.
4. They review signup-cohort return rates.
5. They use the information to understand whether people are using Overload.

The displayed data is aggregate and does not expose individual workouts.

### Journey H — A lifter submits feedback

1. A lifter opens the feedback form inside Overload.
2. They select the appropriate feedback category.
3. They write their message.
4. They submit it.
5. Overload confirms successful submission or clearly reports failure.
6. The feedback becomes available in the owner's administrative inbox.

No additional training data is attached automatically.

### Journey I — Owner processes feedback

1. The owner opens the feedback inbox.
2. They review a submitted message.
3. They identify its category and content.
4. They mark it handled.
5. The inbox reflects the updated state.

The process does not imply that Overload has sent a response to the lifter.

### Journey J — Owner reviews administrative actions

1. The owner opens the audit history.
2. They review recorded administrative operations.
3. Each entry identifies the action, acting administrator, affected account, and time.
4. Existing entries cannot be silently edited through the application.

---

## 6. In scope

This pitch includes:

 1. An owner-only administrative web area.
 2. Server-side allowlist authorization for all admin pages and operations.
 3. Account list and lookup.
 4. Permitted account metadata and status information.
 5. Account suspension.
 6. Account reactivation.
 7. Administrative account deletion through the existing approved mechanism, subject to reconciliation of the deletion contract.
 8. Aggregate operating metrics.
 9. Date-only last-active tracking.
10. Signup-cohort return metrics.
11. An in-app feedback form for authenticated lifters.
12. A feedback inbox for the owner.
13. Feedback categorization and handled state.
14. An append-only administrative audit log.
15. Appropriate user-guidance and release-note maintenance through the shipped guidance mechanisms.

The required authorization, persistence, and verification are part of the complete feature.

---

## 7. Out of scope

### Training-content administration

No admin view of another account's workouts, mesocycles, logged sets, goals, gym baselines, or cardio records.

### Account impersonation

The owner cannot sign in as another account or adopt that account's training context.

### Billing and subscription controls

No Stripe integration, subscription management, payment history, promo-code dashboard, or billing-state editing.

### Complimentary Pro access

Granting, expiring, and revoking comped access belongs to Plans, Billing & Promo Codes.

### Public signup

Signup remains invite-only.

### Password recovery and transactional email

Those belong to Public Accounts, Recovery & Support.

Do not introduce Resend, SMTP, or other email services in this pitch.

### Full support ticketing

No threaded conversations, agent assignments, escalation workflows, or external support-desk integration.

### Detailed behavior tracking

No pageview history, clickstream analytics, per-exercise usage reporting, live online-status monitoring, or individual workout analytics for the owner.

### Third-party analytics

No external analytics platform or tracking service.

### Native admin experience

The admin area remains web-only.

### Administrative editing of training data

No ability to change another account's plan, sets, working weights, goals, or progression history.

---

## 8. Definition of done

The updated Pitch Roadmap establishes five formal completion criteria.

### AC-1 — Non-admin access is impossible

A non-admin account cannot reach an administrative page or operation, whether through the normal interface, a directly entered URL, or a directly invoked server action.

Administrative authorization is enforced on the server for each operation.

**Roadmap trace:** Admin Center & Feedback — Definition of Done 1.

### AC-2 — Suspension and reactivation work

Suspending an account prevents it from using authenticated Overload functionality on its next request.

Reactivation restores access under the ordinary authentication rules.

**Roadmap trace:** Admin Center & Feedback — Definition of Done 2.

### AC-3 — Metrics are correct and private

The administrative metrics agree with the underlying account and usage data.

They expose counts and supported aggregate rates without disclosing individual training content.

**Roadmap trace:** Admin Center & Feedback — Definition of Done 3.

### AC-4 — Feedback works end to end

A lifter can submit feedback.

The owner can read the submission through the administrative inbox and mark it handled.

**Roadmap trace:** Admin Center & Feedback — Definition of Done 4.

### AC-5 — Administrative actions are audited

Every administrative action appears in the append-only audit log.

Records identify the actor, operation, affected account, and time.

**Roadmap trace:** Admin Center & Feedback — Definition of Done 5.

### PRD alignment

The updated PRD separately requires:

* Not-found behavior for non-admin access.
* No exposure of plans, gyms, sets, goals, or cardio through admin views.
* No impersonation.
* Account-management actions.
* Operating metrics and feedback.

These requirements are consistent with the roadmap, except for the administrative deletion conflict noted in Section 14.

---

## 9. Rabbit holes

### 9.1 Exposing training content for support convenience

It may seem reasonable to inspect a user's last workout when investigating a complaint.

However, the approved privacy boundary does not allow this.

The admin center manages accounts and reads aggregate metrics, not workout data.

A future genuine need would require a separately approved feature with narrow, auditable access.

### 9.2 Treating hidden navigation as authorization

An admin link that appears only for the owner is not a security boundary.

Direct URLs and server actions must independently reject unauthorized access.

### 9.3 Implementing admin as a user-configurable role

Administrative identity must come from the server-side allowlist.

Do not create a setting, role assignment, or account profile field that grants admin privileges.

### 9.4 Suspending only future logins

A suspension that blocks new sign-ins but leaves existing authenticated sessions fully operational would fail the roadmap.

The restriction must apply to the next authenticated request.

### 9.5 Sending private training records to the metrics interface

Aggregate metrics do not justify returning individual workouts to the browser and counting them there.

The aggregation belongs behind the server-side privacy boundary.

### 9.6 Creating detailed behavioral surveillance

The owner needs basic adoption and retention counts.

That does not require logging every screen visit or tracking individual workout behavior.

### 9.7 Deleting accounts through a new shortcut

The project already has a dedicated account-deletion mechanism.

Administrative deletion must not create an independent destructive pathway or weaken account-isolation guarantees.

### 9.8 Incomplete auditing

An administrative mutation that changes account state without leaving an audit record violates the feature's central accountability requirement.

The spec must define correct behavior around persistence failures and destructive operations.

### 9.9 Building billing early

The admin interface will eventually display subscription information and manage comped access.

Those capabilities must not be implemented before the entitlement and billing mechanisms exist.

### 9.10 Turning feedback into a support platform

Feedback should provide a simple submission experience and a manageable owner inbox.

Do not expand it into threaded support conversations, email automation, agent assignment, or external ticketing.

### 9.11 Overcomplicating analytics

The approved metrics are sufficient for an initial operations dashboard.

Do not introduce speculative KPIs, prediction models, broad event tracking, or third-party analytics simply because the admin center needs an overview.

---

## 10. No-gos

* No administrative access to private training content.
* No account impersonation.
* No database-role or profile-flag admin privilege system.
* No client-controlled administrator identity.
* No admin operation without a fresh server-side authorization check.
* No admin mutation without an audit entry.
* No cross-account training-data exposure through list, detail, metrics, or feedback endpoints.
* No suspension that is enforceable only at login.
* No separate destructive account-deletion pathway.
* No public signup.
* No Stripe or billing controls.
* No premature complimentary-access functionality.
* No password recovery or third-party email integration.
* No detailed user-behavior surveillance.
* No full customer-support platform.
* No native admin application.

---

## 11. Dependencies

### MVP 3 — Training Intelligence

All earlier pitches are complete and in production.

The feature builds on the established private-account model and existing training product.

### Account Ownership & Isolation

Administrative work must coexist with the strongest established invariant: no account can access another account's private training data.

The dedicated admin metrics layer is an explicitly bounded exception for account metadata and aggregate counts, not an exception that permits viewing training content.

### Accounts: Signup, Login & Account Settings

The existing authentication system identifies accounts and provides the current account lifecycle.

The administrative suspension functionality builds on that authenticated access model.

The existing deletion module must be examined before implementing administrative deletion.

### Onboarding Tour and What's New

Both features have shipped.

The feature's visible changes require user-guidance maintenance through `/overload-onboarding`.

The skill decides whether a tour step is appropriate and maintains the release-note entry through the existing mechanisms.

### Future: Public Accounts, Recovery & Support

The admin status model and feedback experience provide the operational foundation for a later public-account system.

Password recovery and external email delivery are not introduced here.

### Future: Plans, Billing & Promo Codes

The future billing system adds account entitlements, complimentary access, subscription visibility, and promotion information.

This pitch must not create those mechanisms in advance.

### Future: iOS Foundation & Cross-Platform Workflow

The updated roadmap deliberately places the iOS foundation after this pitch.

Because this admin area is defined as web-only, it does not depend on the future mobile shell.

The `overload-cross-platform` skill remains dormant until the iOS foundation ships.

---

## 12. User guidance and release notes

The Onboarding Tour and What's New mechanisms already exist.

This pitch therefore requires a final guidance-maintenance ticket using `/overload-onboarding`.

### Tour-step assessment

The owner-only admin interface is not a normal lifter feature and should not automatically appear in the general onboarding tour.

The skill should inspect the existing tour and determine whether the new feedback entry point warrants guidance.

It should add or update a step only if that is useful under its discoverability criteria.

A new tour step must point at an actual, accessible control.

The tour must not reveal or lead ordinary lifters toward owner-only admin functionality.

### What's New entry

The feedback feature provides a meaningful new way for lifters to communicate with the product owner.

It may warrant a release-note entry.

Illustrative copy:

**Send feedback from Overload**

"Found something that needs fixing or have an idea? You can now send feedback from inside Overload."

The maintenance skill determines the actual entry and significance based on what ships.

The administrative interface itself should not be advertised to ordinary lifters as a feature they can access.

### Guidance boundaries

Use the established tour registry and repository release-note content format.

Do not create a second guidance mechanism.

The guidance must not introduce training-data visibility or owner-only functionality into ordinary user experiences.

---

## 13. Risks and verification focus

### Unauthorized administrative access

This is the highest-risk area.

Verification must prove that ordinary authenticated users, unauthenticated visitors, and direct callers cannot reach privileged operations.

### Admin privacy boundary

Administrative account responses, metrics, and feedback views must not return any training plan, gym, logged set, goal, or cardio content.

### Account suspension

Verify that suspended accounts are refused on their next authenticated request, including when they already hold an authenticated session.

### Reactivation

Verify that reactivation restores permitted access without modifying unrelated account records.

### Administrative deletion

Confirm that any permitted administrative deletion uses the established deletion mechanism and cannot remove another account unintentionally.

Do not consider this verified until the conflict with the user-initiated deletion invariant is resolved.

### Aggregate metric accuracy

Verify counts against controlled underlying records.

Cohort calculations should be tested against their documented definitions rather than interpreted informally.

### Last-active behavior

Verify date-only tracking and the approved update frequency.

### Feedback isolation and submission

Verify that lifters can submit feedback and that ordinary users cannot retrieve or modify another account's submissions.

### Audit completeness

Verify that permitted administrative mutations generate the correct append-only records.

Failure behavior must not silently create unaudited state changes.

### Existing invariants

Preserve:

* Account isolation.
* Canonical logged-set writes.
* Historical data integrity.
* Gym-baseline correctness.
* Derived progression behavior.
* Deny-all row-level security.
* The invite-only signup gate.

Any new table must follow the existing ownership and RLS requirements.

---

## 14. Open questions and source gaps

### Established decisions — do not reopen

The updated documents already settle:

**Administrator identity**

A server-side environment-variable allowlist of authenticated user IDs. No database role and no application-granted admin privilege.

**Administrative privacy**

Only account metadata and aggregate metrics. No training content and no impersonation.

**Administrative audit**

An append-only record of every admin action.

**Suspension**

A stored account status enforced on each authenticated request.

**Feedback**

A lifter-submitted message with category and handled state.

**Billing boundary**

Subscription state is read-only when that feature exists, and comped access is introduced only with the entitlement system.

These are established product and architecture decisions.

### Questions delegated to design and spec

The downstream process must determine:

* The precise admin navigation and account-management hierarchy.
* Account lookup and list interactions.
* Metric presentation and empty states.
* The structure and verification of the dedicated metrics layer.
* The method for maintaining the date-only last-active field.
* The exact signup-cohort definitions supported by available data.
* Feedback form and inbox interactions.
* Audit-log display and persistence behavior.
* Confirmation handling for consequential account actions.

The pipeline guide already supplies conservative standing defaults for last-active tracking and feedback categories.

Their final documented treatment belongs to the normal Resolved Decisions process.

### Material conflict — administrative deletion

This is the one source conflict that cannot be silently treated as an ordinary implementation detail.

The updated roadmap and PRD explicitly authorize the owner to delete an account from the administrative interface.

However, the current `CLAUDE.md` states:

"Deleting an account is the single sanctioned way to destroy logged history. It is user-initiated, confirmed, handled by one dedicated module..."

Both documents protect the same history-integrity requirement, but they do not currently agree on who may initiate that operation.

**Required upstream reconciliation:** Explicitly authorize or otherwise resolve owner-initiated deletion in the controlling deletion rules, while preserving the dedicated module, confirmation, account isolation, and audit requirements.

Do not interpret the roadmap as permission to bypass a conflicting invariant.

If that conflict remains unresolved when the implementation needs to act on it, the project's documented contradiction stop condition applies.

### Future plan-state display

The roadmap describes plan and entitlement state in the account directory *once billing exists*.

The current pitch should not assume a populated billing system exists.

Treat future plan-state display as a downstream integration requirement, not a current feature.

---

## 15. Rollout and delivery boundary

This pitch creates a privileged user-facing area and account-management operations.

It is therefore subject to the project's protected-boundary rules.

### UI-bearing classification

The admin center and feedback form introduce screens, lists, forms, actions, and visible states.

The updated workflow requires the UI-bearing artifact order:

**Pitch → Design Doc → UI Preview → Spec → Linear Tickets → Implementation**

The design and UI skills determine the presentation.

The spec defines the implementation contract.

### Guidance maintenance

Because What's New and Onboarding Tour are already live, the eventual implementation includes a final guidance ticket using `/overload-onboarding`.

### Cross-platform status

The admin center remains web-only.

The iOS foundation has not shipped, so the cross-platform skill is not yet part of this pitch's workflow.

### Merge behavior — stop before merge

The updated pipeline guide explicitly classifies Admin Center & Feedback as **stop before merge**.

This is required because the feature introduces privileged operations and account-management behavior.

The completed feature requires human approval before the feature branch can merge into `main`.

### Production boundaries

The autonomous implementation process must not:

* Apply production schema migrations.
* Change production account status or data.
* Modify production credentials.
* Enable public signup.
* Introduce billing or real charges.

Any necessary production configuration or migration remains a human-operated step, documented by the later runbook.

---

## 16. Handoff to design and spec

The following product outcomes are fixed:

 1. Overload has an owner-only, web-based administrative area.
 2. Administrator identity is determined through a server-only allowlist.
 3. Every administrative operation checks authorization on the server.
 4. Non-admin access returns not-found.
 5. The owner can list and look up accounts using permitted metadata.
 6. No administrative response exposes private training content.
 7. The owner can suspend and reactivate accounts.
 8. Suspension applies on the account's next authenticated request.
 9. Administrative deletion is required by the roadmap but must comply with a reconciled deletion contract.
10. The admin area displays the defined aggregate operating metrics.
11. Last-active tracking is date-only.
12. Signup-cohort return rates are aggregate and based on documented data.
13. Every lifter can submit categorized feedback.
14. The owner can read feedback and mark it handled.
15. Administrative actions are recorded in an append-only audit log.
16. Billing, promo management, and comped access remain deferred.
17. No impersonation or training-content inspection is introduced.
18. The feature remains consistent with the established Overload design system.
19. Visible changes receive appropriate guidance maintenance.
20. The feature branch stops before merge for human approval.

The design stage owns the interface flows and presentation.

The spec stage owns the exact persistence, authorization, metrics, validation, and test contracts.

Neither stage may weaken the account-isolation or logged-history invariants to make administrative operations easier.

**Completion outcome:** The owner can securely operate Overload, understand adoption at an aggregate level, manage account access, and review lifter feedback, without gaining unrestricted access to anyone's private training information.

**End of pitch.**
