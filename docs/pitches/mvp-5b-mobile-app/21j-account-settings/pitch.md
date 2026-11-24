# Pitch 21j — Account & Settings

> Source: the expanded pitch the owner supplied to start the pipeline run of 2026-11-24, copied here unchanged in substance. It expands `docs/planning/mobile-roadmap.md` → "21j — Account & Settings (M)". The audit's endpoint inventory for this slice is `docs/planning/mobile-audit.md` §2 ("21h — account and settings"; the audit numbered the slices before 21h/21i were split).

**Project:** Overload V1
**Parent:** Pitch 21 — Mobile App
**Milestone:** MVP 5B — Mobile App
**Type:** Feature — Native mobile vertical slice
**Appetite:** Medium (M), with a high-risk deletion dependency
**Status:** Ready for design and specification
**Client scope:** Native iOS, with required backend and web-parity corrections
**UI-bearing:** Yes
**Plan placement:** Free — account management, support, and data export must not depend on Pro
**Dependencies:** Completed mobile slices 21a–21i, existing web account-management services, and verified Stripe cancellation behavior

---

## 1. Overview

Pitch 21j brings Overload's account-management experience into the native iPhone application.

Previous mobile pitches established the main workout experience, progression guidance, exercise history, goals, plan browsing, library management, gyms, and weekly scheduling. However, an iPhone user must also be able to manage their account without depending on the website for ordinary settings and account-lifecycle actions.

This pitch provides:

- Profile management.
- Appearance preferences.
- What's New.
- Feedback with screenshots.
- Full account-data export through the native share sheet.
- In-app account deletion.
- Read-only subscription and access information.
- Support and account-help entry points.

These capabilities must use the existing web domain services and authoritative account state. The native application should feel complete while respecting the existing distinction between account management and commercial purchase flows. The user must be able to manage or leave the service without a Pro subscription.

## 2. Problem

Overload's native application can now support a complete strength-training workflow, but account management is still incomplete. A lifter may need to update their name, change appearance preferences, check their access status, understand recent app changes, send feedback with a screenshot, request help, download their account's information, or delete their account permanently.

Without native support, these tasks require navigating to the website or using inconsistent temporary links. That introduces friction and makes the iPhone experience feel unfinished.

Account deletion is particularly important because deleting the account is the one supported action that permanently removes logged training history. It must be accessible, deliberate, secure, and complete. Data export is equally important because a lifter must be able to take their records with them, whether they use Free or Pro.

The problem is not that the application lacks an account-management backend. The web already provides much of this functionality. The problem is exposing those capabilities coherently and safely inside the iPhone experience.

## 3. Desired Outcome

A lifter can open native Settings and manage their Overload account without needing the web application for routine actions. They can view and update their profile; choose light, dark, or system appearance; review the product's release notes; submit feedback with an optional screenshot; contact support; export their account data; see their current Free, trial, Pro, or complimentary access state; delete their account through a deliberate, secure confirmation flow; and understand the consequences of account deletion before confirming.

Account deletion removes the correct account's training data without affecting any other account. Active subscription obligations must be handled according to the existing approved cancellation policy. Native settings remain consistent with the web application.

Success means the account can be managed from the iPhone without introducing a native purchase flow.

## 4. Appetite and Scope

Medium (M). Most settings functionality should reuse existing backend services and native UI components. The pitch is manageable as one vertical slice if it does not expand into authentication redesign, billing-system changes, or a new support platform.

The highest-risk work is in-app account deletion, Stripe cancellation and deletion ordering, secure full-data export, screenshot attachment handling, and cross-platform preference consistency.

Do not redesign authentication or the billing system. If the Stripe cancellation dependency remains unresolved, identify and fix the smallest necessary web/backend correctness issue under the canonical safety rules. A destructive-data or subscription-lifecycle blocker must not be bypassed to keep the pitch within its Medium appetite.

## 5. Solution Shape

### 5.1 Native Settings Home

Expand the existing More/Settings experience into a coherent account-management destination, with grouped, understandable sections for: Account and Profile; Appearance; Access and Subscription; What's New; Feedback and Support; Your Data; Delete Account.

The precise information architecture belongs to native UI design. Settings should remain easy to scan on a small iPhone. Avoid placing every setting and destructive action into one uninterrupted list. The Delete Account action should remain discoverable but visually distinct from ordinary settings. Preserve existing native navigation, authentication state, diagnostics, and sign-out behavior.

### 5.2 Profile Management

Provide native viewing and editing of the fields already supported by the web profile service. At minimum: first name; last name; relevant account identity information shown read-only.

The authoritative account model also includes an account timezone. Inspect whether the current web interface allows users to edit timezone and determine whether it belongs in native profile management. The native experience must not introduce contradictory timezone semantics.

Expected behavior: current profile values load accurately; editable fields can be changed and saved; validation agrees with web; successful edits persist after relaunch; changes made on web appear on native after refresh; invalid input produces a useful explanation; failed saves do not falsely display success; a changed first name updates the native greeting and other applicable UI.

Email and password remain managed through their existing authentication and recovery flows. Do not invent an unsupported email-change or password-change feature. If such account fields are currently read-only, communicate that accurately.

### 5.3 Appearance Preferences

Expose the established three appearance options: Light, Dark, System. System should remain the established default unless the account already has another saved preference.

Requirements: changes apply visibly; the setting persists; the interface responds appropriately when the system appearance changes; all Settings screens remain readable; existing native preferences are respected; web/native behavior follows the established preference ownership model.

Do not add a new theme engine. Do not create separate conflicting preference authorities. Inspect whether appearance is account-synced or device-specific in the existing implementation, and preserve the intended distinction.

### 5.4 What's New

Bring Overload's existing release-note experience into native Settings. The user can open What's New and review dated product updates. The native experience should use the canonical release-note source rather than maintaining an independent list.

Requirements: entries appear in the established order; dates, titles, and descriptions are accurate; relevant changes are visible; a newly created account does not inherit a backlog of unread updates; already-seen updates are not repeatedly presented as new; multiple unseen significant updates follow the existing combined-presentation behavior; existing web acknowledgement state is respected where the same user-visible release is involved.

The design should determine how release notes distinguish web-only changes from native-relevant changes. Do not announce a native feature as available before its corresponding release is actually distributed to that client. The automatic first-load release-note experience must be considered separately from the permanent What's New history.

### 5.5 Feedback with Screenshots

Provide a native feedback flow using the existing feedback domain and owner's established feedback inbox. The user should be able to: open Feedback from Settings; select an available feedback category; enter a message; optionally attach a screenshot; review the attachment before submission; remove or replace an attachment; submit the feedback; receive a clear success or failure result.

The submitted feedback should reach the existing owner inbox. Do not create a parallel native-only feedback database or admin interface.

**Screenshot behavior.** Use existing supported iOS image-selection or attachment patterns. An attached screenshot may contain training performance, names, gym information, account information, or other visible personal data. The user must choose the attachment intentionally. Do not silently capture or upload the screen. Do not automatically attach training content. Validate file type, size, and upload limits on the server. Preserve account ownership and storage access restrictions. On submission failure, preserve the written draft and selected image when safe. Prevent duplicate submissions caused by repeated taps or retries. The owner's admin inbox remains web-only.

### 5.6 Account Data Export

A lifter can export all their account-owned information from the iPhone. This is available on Free and Pro. The feature should reuse the existing authoritative web data-export service. Do not create a separate mobile export format that omits training data. The exported information must remain consistent with the approved account-export contract. Relevant account-owned information includes the supported profile, plans, sessions, logs, goals, custom exercises, gyms, preferences, and other account data covered by the existing exporter. The exact schema must come from the canonical current export implementation.

**Native delivery.** The user initiates Export Data. The backend creates or supplies the authorized export. The app presents the file through the native iOS share sheet. The user can choose an appropriate destination, such as Files or another supported share target.

Requirements: no Pro gate; no cross-account data; no unrelated library or admin information; correct output filename and file type; valid, readable file; no unintended truncation; clear handling of larger exports; reliable behavior when sharing is cancelled; temporary local files handled according to the approved retention policy; no credentials or tokens included in the exported file. An export must not silently upload user records to unrelated services. Exporting should not delete or modify any training history.

### 5.7 Access and Subscription Status

The native application should show the user's current account access clearly. Possible existing states include Free; active Pro trial; active Pro subscription; complimentary Pro access; expired or lapsed paid access; relevant subscription state transitions.

Show only information supported by the authoritative entitlement service. Do not invent subscription dates, charges, or renewal terms. If dates are displayed, use the correct account-local presentation and authoritative billing state. The user should understand which capabilities are available.

**Billing boundary.** The roadmap explicitly keeps native purchase functionality out of this slice. Do not implement Stripe Checkout inside the app, new subscription purchase, native promo-code redemption, in-app purchase, StoreKit billing, or subscription upgrade buttons that bypass the approved store-distribution policy. Existing web billing and customer-portal capabilities remain separate. The native access screen is read-only. If support or subscription-management information must be shown, use the approved, policy-compliant behavior and avoid presenting an unauthorized native purchase flow.

### 5.8 Support

Provide an accessible Support destination. Use the existing authoritative support channel and available help resources. The user should be able to find assistance for account access, workout logging issues, export problems, deletion questions, billing questions, and general application problems.

Reuse the current support endpoint or official support route. Do not invent unverified contact details. A support action must have a real destination and should fail understandably when no supported action is available. Keep Feedback and Support distinct where their purposes differ.

### 5.9 In-App Account Deletion

This is the highest-risk capability in the pitch. A signed-in lifter must be able to permanently delete their own Overload account from the native application. The workflow must reuse the existing account-deletion domain and established web semantics. The account-deletion module is the only sanctioned path for permanently destroying logged training history.

**User experience.** The user opens Delete Account from Settings. The application explains that the account will be permanently deleted; that training history and associated account data will be removed; that the action cannot be undone; and existing billing obligations and cancellation behavior, where relevant. The user must deliberately confirm. The exact confirmation mechanism belongs to the design/specification stage and must follow approved security patterns. Do not make destructive deletion a one-tap action.

**Authorization.** Only the authenticated account owner can delete the account. Do not accept arbitrary account IDs from the client. Do not expose another account's existence. Follow the existing reauthentication or identity-confirmation requirement where applicable.

**Data integrity.** Deletion must use the dedicated authoritative account-deletion module. Preserve the established deletion ordering and transaction boundaries. Delete only the authenticated account's owned records. Do not weaken the logged-history invariants or introduce an independent native cascade. Do not delete shared library exercises. Do not corrupt another user's data.

**Completion.** After successful deletion: existing authentication sessions must no longer provide usable account access; native credentials and local private account state are cleared; the user is returned to the appropriate signed-out experience; a deleted account cannot continue calling protected mobile endpoints. The client must not falsely claim deletion completed if the server operation failed. The application must not leave the user in a partially authenticated state displaying stale private information.

### 5.10 Stripe Cancellation Dependency

The mobile roadmap explicitly states that account deletion depends on the web's Stripe cancellation fix. This dependency must be inspected before implementing the destructive native flow.

The specification must verify how the current server-side deletion process handles: an account without a Stripe customer; a Free account; an active Pro trial; an active paid subscription; an already-cancelled subscription; a complimentary entitlement; a cancellation request that fails; delayed or duplicated Stripe webhooks; an already-deleted or partially deleted account; a retry after a network timeout.

**Required outcome.** An active paid account must not be left with an unmanaged recurring subscription merely because the Overload account was deleted. Likewise, a temporary external cancellation failure must not lead the client to claim that the deletion fully succeeded.

Inspect the approved billing architecture and current cancellation implementation. Follow the canonical ordering, transaction, retry, and reconciliation rules. Do not invent ad hoc Stripe calls inside the React Native app. Do not let the client manipulate subscription state directly. If the required web Stripe cancellation fix has not been completed, treat this as a blocking dependency for the destructive deletion capability. Resolve it through the appropriate reviewed backend workflow or stop at a mandatory approval boundary. Do not silently ship a broken deletion path.

## 6. Free and Pro Rules

Account management is not premium functionality. The following must remain available regardless of subscription: profile management; appearance settings; What's New; feedback; support; account data export; account deletion; read-only access status.

The server must enforce authenticated ownership, not subscription status, for these capabilities. Premium training intelligence remains separately gated according to the existing product rules. Do not show a purchase flow in the native app.

## 7. Web and Native Parity

The user should experience equivalent account capabilities across the two clients.

| Capability | Web | Native 21j |
| --- | --- | --- |
| Profile details and edits | Existing account settings | Native equivalent |
| Appearance | Existing preference behavior | Native three-option selector |
| What's New | Canonical release notes | Native list and acknowledgement |
| Feedback | Existing backend and inbox | Native form with screenshot |
| Export | Existing account exporter | Same authoritative export via share sheet |
| Delete Account | Existing deletion service | Native confirmed deletion |
| Access status | Existing entitlement source | Read-only native display |
| Support | Established support channel | Native entry point |

Equivalent capability does not require identical screens. Intentional differences, such as a native share sheet versus a browser download, are expected. Do not create duplicate domain rules.

## 8. Security, Privacy and Account Isolation

- **Account scoping.** Every new authenticated endpoint must use identity from the verified session or token. Do not accept client-supplied ownership identifiers.
- **Export confidentiality.** The exported file contains personal account information. Use appropriate authorization, file handling, expiration, and cleanup.
- **Feedback attachments.** Screenshots must be user-selected and stored or transmitted securely. Restrict unauthorized reads and enforce size/type rules.
- **Destructive deletion.** Account deletion uses the dedicated module and established safeguards.
- **Authentication state.** Logout, token expiry, suspension, and deletion must clear or invalidate sensitive state appropriately.
- **Backward compatibility.** Changes to the versioned mobile API must remain compatible with existing supported app versions.
- **Logging.** Do not log passwords, session tokens, full account exports, or sensitive screenshot contents.
- **Free/Pro.** No account-management action may be blocked merely because a user lacks Pro.

## 9. Loading, Error and Recovery States

The native application must handle: profile load failure; invalid profile changes; save timeout; session expiry; offline/unreachable server; release-note retrieval failure; screenshot permission denial; attachment too large; feedback upload failure; repeated feedback submission; export generation failure; share-sheet cancellation; insufficient local storage; subscription status temporarily unavailable; deletion cancellation by the user; deletion request timeout; external billing cancellation failure; deletion completed but local sign-out or cleanup interrupted.

Do not falsely display a successful save, export, feedback submission, or deletion before receiving authoritative confirmation. Preserve user-entered drafts where safe and appropriate. Do not cache sensitive export data longer than necessary.

## 10. Definition of Done

**A. Settings and Profile.** Settings is accessible from the existing native navigation. Profile values are accurate. Supported fields can be edited and saved. Validation matches web behavior. Changes persist after relaunch. Updates propagate to relevant native screens. Changes made on web appear correctly on native.

**B. Appearance.** Light works. Dark works. System works. The preference persists. System changes are handled. Settings screens remain readable.

**C. What's New.** Native release-note history is accessible. Entries come from the canonical source. Dates and content are correct. Seen/unseen behavior is preserved. New users have no unread backlog. Significant unseen entries follow the existing acknowledgement behavior.

**D. Feedback.** The user can choose a category, enter text, attach an optional screenshot, remove or replace an attachment, submit successfully, and receive accurate confirmation. The submission reaches the existing owner inbox. Failed submissions preserve a safe retry path. Attachments remain access-controlled.

**E. Export.** Data export is accessible on Free and Pro. It uses the authoritative full-account export. The generated file is valid. The iOS share sheet opens. The user can save or share the file. A cancelled share does not corrupt account data. Other accounts' data is excluded. Temporary files follow the retention policy.

**F. Account Access.** Current entitlement is displayed accurately. Free, trial, paid, complimentary, and lapsed states are handled according to actual domain data. The display does not invent billing information. No native purchase flow exists. The access screen does not leak Pro-only training intelligence.

**G. Support.** Support has a real, accessible destination. Feedback and support purposes are understandable. Existing published support information is reused.

**H. Account Deletion.** A signed-in user can initiate deletion natively. The consequence is clearly explained. Explicit confirmation is required. A cancellation leaves the account unchanged. The correct account is deleted. Other accounts are unaffected. Logged history and owned account data are removed through the authoritative deletion module. Existing billing cancellation rules are satisfied. Failed cancellation/deletion does not falsely report success. Repeated requests are handled safely. Authenticated access is revoked after successful deletion. Native private account state is cleared. The app returns to the signed-out state. No direct client database access is introduced.

**I. Verification.** All new mobile API paths pass account-isolation tests. The account-deletion suite passes. Stripe-related lifecycle tests pass. Export isolation passes. Attachment validation and ownership tests pass. Mobile API compatibility passes. Existing workout and History tests remain green. Staging deployment is verified. A compatible Expo staging OTA is published. Physical-iPhone acceptance passes. Production promotion remains separately authorized.

## 11. Rabbit Holes and Risks

1. **Stripe account deletion.** Do not assume cancelling a subscription and deleting a local account form one atomic operation. Respect external-service failure and recovery semantics. This is the primary release-risk gate.
2. **Accidentally deleting history.** Use only the dedicated deletion module. Do not allow normal profile or settings mutations to affect training history.
3. **Duplicate export implementations.** Reuse the existing exporter. Do not independently construct partial exports for native.
4. **Sensitive local files.** Exported archives and feedback screenshots may contain personal information. Control temporary storage and cleanup.
5. **Native screenshot dependencies.** Inspect whether existing Expo modules can support the required image picker, upload, and share-sheet behavior. If a native dependency changes the runtime fingerprint, follow the required development-build approval workflow. Do not silently assume a JavaScript OTA can install a missing native module.
6. **Conflicting appearance preferences.** Avoid device/account synchronization behavior that contradicts the existing web and mobile settings model.
7. **What's New cross-platform relevance.** Not every web feature is available in the native app. Release notes should not misleadingly announce unavailable native capabilities.
8. **Billing UI expansion.** The native settings screen must not turn into a subscription purchase interface.
9. **Excessive settings redesign.** Use existing navigation and native design patterns. Do not redesign the application shell.
10. **Large exports.** An account may own extensive historical data. Ensure large exports can be delivered reliably without silently dropping records or exhausting device resources.

## 12. Explicit Non-Goals

New signup methods; social login; a new password recovery system; a new email-change feature unless already supported by the approved account domain; native billing checkout; in-app purchases; StoreKit subscription management; new Stripe subscription products; new promo-code redemption; admin account management; viewing other users' data; a new customer-support backend; a built-in messaging system; a native full-plan builder; advanced notification settings; gym location awareness; the native coach-mark tour; TestFlight distribution; App Store release; Android; rebuilding account export; rebuilding account deletion; an unrelated global UI redesign.

## 13. Dependencies

**Completed native slices.** Pitches 21a–21i provide the native shell and authentication, secure token storage, workout logging, History, progression intelligence, plans, library, and gyms, goals and exercise history, and weekly scheduling parity.

**Existing web/domain dependencies.** Accounts and Isolation (authoritative profile and ownership services); Pitch 12 — What's New (canonical dated release notes and acknowledgement behavior); Pitch 17 — Admin Center & Feedback (existing feedback inbox and account administration); Pitch 18 — Public Accounts, Recovery & Support (existing account export, deletion, recovery, and support capabilities); Pitch 19 — Plans, Billing & Promo Codes (entitlement source, billing state, and Stripe lifecycle).

**Explicit blocking dependency.** Verified web Stripe cancellation fix for account deletion. The implementation must confirm this dependency is satisfied before delivering native destructive deletion.

**Downstream.** 21k — Native Tour (adds guided native coach marks, leveraging the completed Settings structure). 21l — TestFlight Beta (production-connected beta distribution and final device polish).

## 14. Open Questions for Design and Specification

Resolve ordinary questions against the current web implementation, approved specifications, and existing architecture. Record each resolution under Resolved Decisions.

- **Q1. Settings information architecture.** How should Account, Appearance, What's New, Feedback, Support, Data Export, and Delete Account be grouped within native navigation?
- **Q2. Editable profile fields.** Which fields are currently editable on the web, and which are read-only? Does timezone editing belong here?
- **Q3. Appearance storage.** Is appearance preference per device, per account, or shared across web and native? How should existing values be reconciled?
- **Q4. What's New relevance.** How are native releases distinguished from web releases? Which updates should trigger first-load acknowledgement?
- **Q5. Screenshot selection.** Which existing Expo capabilities are available for selecting or attaching images? Is any runtime-changing dependency necessary?
- **Q6. Feedback attachment contract.** What file types, size limits, storage paths, and cleanup rules exist in the current feedback backend? What must be added for native submissions?
- **Q7. Export format.** Which output format and schema does the existing web exporter provide? How should that format be named and passed to the native share sheet?
- **Q8. Export size.** What are the existing export-size and execution limits, and how should native delivery handle them?
- **Q9. Temporary file retention.** When should a locally downloaded export be removed? How are interrupted exports cleaned up?
- **Q10. Read-only access display.** Which subscription and trial fields are authoritative and appropriate to display inside the native app?
- **Q11. Subscription-management guidance.** What support or informational text may be shown without introducing a native purchase or checkout flow?
- **Q12. Stripe deletion prerequisite.** Has the previously identified web cancellation defect actually been fixed? What verified implementation and tests demonstrate it?
- **Q13. Deletion confirmation.** What identity-verification or reauthentication steps does the current web deletion flow require? How can the native UX offer equivalent protection?
- **Q14. Deletion ordering and partial failures.** What happens if Stripe cancellation succeeds but database deletion fails, or vice versa? Which existing recovery and reconciliation rules govern the result?
- **Q15. Session invalidation.** How are refresh tokens and other active sessions invalidated following deletion? What should happen on a second device?
- **Q16. Support entry point.** Which current support route or contact method is canonical? Should support open a web page, email composer, or existing native feedback surface?
- **Q17. Free/Pro account actions.** Are all new account-management endpoints correctly accessible to Free accounts without exposing premium training information?
- **Q18. API version compatibility.** Which existing web services can be exposed through additive mobile API endpoints? What older-client behavior must remain unchanged?
- **Q19. Physical-device verification.** Which Settings interactions must be tested on the actual iPhone rather than relying on mocked navigation and automated tests?
- **Q20. Medium appetite.** Does full deletion safety, feedback screenshots, and export stay within the Medium appetite using existing backend services? If not, what is the smallest safe coherent delivery plan?

## 15. Streamlined Physical-iPhone Acceptance

Avoid separate accounts for every minor settings state. Use one primary reusable account and one disposable deletion account. Automated tests should cover detailed failure cases.

- **Scenario A — Profile, Appearance, What's New** (primary account): open Settings; change the profile name; confirm persistence; switch Light, Dark, and System appearance; review What's New; confirm release-note acknowledgement behavior.
- **Scenario B — Feedback and Support** (same account): open Feedback; enter a message; attach a test screenshot; review and submit; verify successful delivery; open Support and confirm the destination works.
- **Scenario C — Data Export and Access** (same account): review current access status; start an account export; open the iOS share sheet; save the export to Files; confirm the exported file is valid and includes expected owned data.
- **Scenario D — Account Deletion** (a dedicated disposable development account; never the primary acceptance account): open Delete Account; review the warning; cancel once and verify the account remains intact; initiate deletion again; complete the required confirmation; verify sign-out; verify the deleted account can no longer authenticate; verify the development backend removed the correct owned records. Do not use a real paid Production subscription for the destructive test.
- **Scenario E — Final Regression** (primary account): confirm Today, History, and Goals still work; confirm workout logging is unaffected; confirm sign-out and sign-in still work.

The owner should be able to complete these checks in one sitting without creating many different accounts.

## 16. Delivery Pipeline

Follow the established Overload autonomous pipeline.

1. Pitch Review — confirm the expanded scope against the PRD, roadmap, and current code; resolve ordinary uncertainties.
2. Design Document — produce the complete Account & Settings design.
3. Native UI Design — design the native Settings experience using the existing mobile design system: Profile, Appearance, What's New, Feedback, screenshot attachment, Export, access status, Support, Delete Account, and loading, error, and empty states.
4. Specification — API contracts, account ownership, validation, attachment handling, export delivery, Stripe cancellation preconditions, deletion sequence, token invalidation, compatibility, failure recovery, test requirements.
5. Linear Tickets — coherent implementation tickets, with account deletion and billing safety independently reviewable.
6. Implementation — reuse existing web services and shared domain logic; use the versioned mobile API.
7. Independent Review — focused review of account deletion, Stripe lifecycle, data export, feedback attachment privacy, and cross-account isolation.
8. Automated Verification — run all standing tests and required new security, deletion, export, and compatibility tests.
9. Staging Integration — merge reviewed changes into staging; confirm the development environment and API behavior.
10. Expo Staging Delivery — publish one compatible staging OTA where possible. If a native runtime change is genuinely required, follow the canonical development-build approval boundary.
11. Physical-iPhone Acceptance — run the five grouped checks.
12. Production — production promotion requires a separate owner-authorized release after acceptance. Do not merge to main as part of the ordinary pitch execution run.

## 17. Final Success Statement

Pitch 21j succeeds when an Overload user can manage their account from the iPhone: update their profile, choose their appearance, review releases, send feedback with a screenshot, access support, export their records, understand their current access, and permanently delete their account through a secure confirmed flow.

The native application must reuse the authoritative web services, preserve account isolation, and respect Free/Pro and billing rules. Account deletion must not leave subscriptions unmanaged or damage another user's data. Exports must be complete and private. No native purchase flow is introduced.

21j completes the foundational native account-management experience required before the remaining native tour and TestFlight milestones.
