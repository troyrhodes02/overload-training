# Overload — Pitch 9: Accounts — Signup, Login & Password Reset

> Source: Linear document "Overload — Pitch 9: Accounts — Signup, Login & Password Reset"
> (`807836d3-bc59-4845-85b5-194c3359b14f`, project Overload V1), copied verbatim
> on 2026-10-19 for the autonomous pipeline run. Linear is the original.

**Type:** Feature
**Status:** Planned
**Appetite:** L — Large
**Depends on:** Multi-User Foundation
**PRD feature:** Accounts: Signup, Login & Password Reset

---

## 1. Problem

Overload has already established its core strength-training experience: a lifter builds a plan, logs training, and receives progression recommendations based on their own performance.

The product is now expanding from one lifter to a small, invite-only group of friends.

Multi-User Foundation establishes the underlying separation between accounts. However, that alone does not let another person actually use the product. Friends still need a way to create an account, sign in, recover access, and manage their personal information without relying on the product's owner.

Without that experience, every new lifter would require manual assistance simply to enter and continue using the application. A forgotten password could prevent someone from reaching their training plan. Basic account management would remain unavailable.

There is also a safety requirement: opening registration must never undermine the private-account model established by Multi-User Foundation. A new lifter must enter an account containing only their own information, and the existing lifter's data must remain inaccessible.

Overload is not becoming a public fitness platform. It is becoming an independently usable product for a small group of invited lifters.

This pitch closes that gap.

## 2. Appetite

**L — Large**

This pitch combines several closely related but individually meaningful capabilities:

* Invite-only account registration.
* Existing-account login and logout.
* Password recovery through email.
* Personal profile management.
* Confirmed, permanent account deletion.

The complexity comes less from the forms themselves and more from their interactions with authentication, identity, account isolation, email delivery, and irreversible data deletion.

It remains one pitch because these capabilities form a coherent account lifecycle. Separating the interface from authentication behavior would create artificial boundaries, while creating individual pitches for small account operations would fragment one shared experience.

The appetite is constrained to ordinary email-and-password accounts for a small, invite-only product. No additional identity providers, administrative capabilities, verification systems, or public-account infrastructure are justified.

The deletion flow deserves particular attention because it is the only sanctioned way to permanently destroy a lifter's training history.

## 3. Value delivered

A friend can receive an invitation, create an account, sign in, and begin using Overload without needing the owner to set up their login.

Each lifter can independently return to their account, recover a forgotten password, change their name, or permanently delete their account.

The existing account remains intact, and no account can access or modify another account's data.

When complete, Overload has the full account lifecycle necessary to support a small group of invited users.

The onboarding experience that teaches a new lifter how to use the training product arrives separately in Onboarding Tour.

---

## 4. Solution shape

### 4.1 Invite-only signup

A prospective lifter receives an invitation code from the product's owner and visits the signup page.

The signup experience collects:

* First name.
* Last name.
* Email address.
* Password.
* Invite code.

The invitation code is required. Registration is rejected when the code is missing or invalid.

The approved direction is a shared invite code maintained by the operator, validated on the server, and rotatable without introducing a separate invitation-management interface.

A successful signup creates an independent account with its own profile and private training-data context.

The lifter does not inherit the existing user's plan, gyms, goals, custom exercises, workout history, or other private information.

The account begins empty unless the owner has separately seeded that person's own written workout plan through the approved operator process.

No email-confirmation step is required.

The signup experience should be straightforward, restrained, and consistent with the application's existing visual system. Detailed screen layout, validation presentation, and interaction states belong to the design-doc and UI-preview stages.

**Important boundary:** Registration must remain disabled in production until Multi-User Foundation has been applied and verified there. Completing the signup implementation is not permission to bypass that rollout gate.

### 4.2 Login

An existing lifter can sign in with their email and password.

Successful authentication establishes their own account context and grants access to the existing Overload training experience.

The application continues to use the established authentication system rather than introducing another identity mechanism.

A lifter who is not authenticated cannot access private training pages or perform protected account operations.

Login must work for both the existing original account and newly created accounts.

Invalid credentials produce a clear failure state without granting access.

No social login, multi-factor authentication, account switching, or shared-account behavior is included.

### 4.3 Logout

An authenticated lifter can explicitly sign out.

Signing out ends their authenticated access to private account content.

Returning to a protected part of the application after logout requires authentication again.

Logout is part of the same account lifecycle, not a separate feature or redesign of application navigation.

The design stage should place the action appropriately within the existing interface.

### 4.4 Forgot password

A lifter who cannot remember their password can begin recovery from the login experience.

They provide their email address and request a reset.

The application responds in the same manner whether that email belongs to an existing account or not. The recovery request must not reveal account membership.

For an existing account, a password-reset email must actually reach the lifter's address, including addresses outside the product owner's Supabase team.

This requires transactional email delivery beyond Supabase's restricted default sender.

The Architecture Doc identifies custom SMTP through Supabase Auth, with Resend as the recommended provider. The email provider and domain setup remain operational prerequisites, not grounds for expanding this pitch into a broader messaging system.

### 4.5 Reset password

A lifter who receives a valid reset email follows its link to set a new password.

The recovery flow must allow the person to regain access to the same account, including its existing plan and training history.

Password recovery changes authentication credentials, not account ownership or training data.

The experience must handle invalid or expired recovery links without exposing private data or requiring intervention from the product owner for ordinary recovery.

No custom password-complexity system is included beyond the approved Supabase authentication rules.

### 4.6 Account profile

Each account has a personal profile containing:

* First name.
* Last name.
* Account timezone.

The email and password remain managed by the established authentication system.

The timezone foundation is created by Multi-User Foundation. This pitch completes the account-facing portion of that model by capturing the browser's detected timezone when the account is created and making timezone editable through Settings.

The stored timezone is the authority used by Overload's existing per-account date behavior.

The profile belongs only to its account.

### 4.7 Account settings

An authenticated lifter can access Settings to manage their account.

This pitch adds the ability to edit their first and last name, along with their timezone.

Changes apply to the signed-in account only.

The settings experience should clearly distinguish ordinary profile editing from permanent account deletion.

A full Settings redesign is not required. The existing application structure should be reused.

The appearance preference, which is introduced in Personalization & Navigation Polish, is not part of this pitch.

### 4.8 Delete account

An authenticated lifter can permanently delete their own account through Settings.

Deletion is explicitly initiated by the account owner and requires confirmation that makes the consequence clear.

The flow must explain that deletion removes the account's training data, including its plans, logged history, goals, gyms, and other private records.

Once confirmed and successfully completed, the account and its owned data are permanently removed.

Deletion must not remove or alter another account's records or the shared exercise library.

This is the only sanctioned exception to Overload's ordinary principle that logged history is preserved.

The Architecture Doc's existing account-deletion direction governs the underlying lifecycle. Detailed deletion sequencing, failure handling, and confirmation design belong to the design/spec stages, rather than being decided within the pitch.

Because deletion is irreversible, this flow requires especially strong verification before production rollout.

---

## 5. Primary user journeys

### Journey A — A friend joins Overload

1. The owner gives a friend an invite code.
2. The friend opens the signup page.
3. They enter their name, email, password, and invite code.
4. The application validates registration.
5. Their account is created.
6. They enter their own private Overload experience.

If no plan exists, they can use the existing plan builder.

If the owner has seeded their written training plan through a separate operator task, the plan is available in their account.

The upcoming Onboarding Tour pitch supplies the guided first-use experience. This pitch does not implement it.

### Journey B — An existing lifter returns

1. The lifter opens Overload.
2. If unauthenticated, they reach login.
3. They enter their credentials.
4. Authentication succeeds.
5. They return to their own training data.

The process does not require an invitation code after the account has already been created.

### Journey C — A lifter forgets their password

1. The lifter selects forgot password.
2. They enter their email address.
3. The application provides a neutral confirmation.
4. An existing account receives a recovery email.
5. The lifter opens the recovery link.
6. They choose a new password.
7. They can sign in and continue using their existing account.

No training history or account ownership changes.

### Journey D — A lifter updates their information

1. The lifter opens Settings.
2. They edit their name or timezone.
3. They save their changes.
4. The updated information belongs only to their account.

The application continues to use that account's saved timezone for date-sensitive behavior.

### Journey E — A lifter deletes their account

1. The lifter opens account Settings.
2. They choose to delete their account.
3. The application explains that deletion is permanent and includes their training history.
4. The lifter explicitly confirms.
5. The account and its private data are removed.
6. The deleted account can no longer access its former training data.

No other account is affected.

---

## 6. Boundaries

### In scope

**Accounts: Signup, Login & Password Reset**, as defined in the PRD, including the associated profile-management and deletion behavior.

The pitch delivers complete end-to-end capabilities, not just forms or authentication functions.

### Out of scope

**Onboarding Tour**

Do not create the guided first-login tour, contextual product tutorials, replayable help guide, or tour-completion state. Those belong to Onboarding Tour.

**Personalization & Navigation Polish**

Do not add a personalized dashboard greeting, appearance preference, or mobile navigation redesign.

**What's New**

Do not add release-note modals, read-state tracking, or a release-history page.

**Plan seeding**

Do not add a feature for uploading, parsing, or automatically creating training plans from documents.

Seeding a friend's existing written plan is a separate, human-operated task, not a feature pitch.

**Email verification**

No email-confirmation or address-verification requirement during signup.

**Social authentication**

No Apple, Google, or other third-party login.

**Multi-factor authentication**

No additional authentication factors or enrollment experience.

**Roles and administration**

No admin dashboard, account-management console, invitation-management UI, or privilege hierarchy.

**Public registration**

The product remains invite-only. This pitch must not transform it into an open public service.

**Billing and subscriptions**

No payments, plans, quotas, or paid-account tiers.

**Social features**

No friend lists, profiles visible to other accounts, data sharing, or collaboration.

**Training-system redesign**

No changes to how lifters construct mesocycles, log workouts, receive progression recommendations, or track gym-specific baselines, except what is necessary to operate those existing capabilities under an authenticated private account.

---

## 7. Definition of done

All formal acceptance criteria below are traced to the PRD feature **Accounts: Signup, Login & Password Reset**.

### AC-1 — Successful invited signup

A new person can sign up with a valid invite code and land in their own empty account.

The account is independent from the existing production account and does not inherit anyone else's private training information.

**PRD trace:** Accounts: Signup, Login & Password Reset — Acceptance criterion 1.

### AC-2 — Invite-code enforcement

Signup without a valid invite code is rejected.

This includes missing and incorrect codes.

**PRD trace:** Accounts: Signup, Login & Password Reset — Acceptance criterion 2.

### AC-3 — Working password recovery

A password-reset email reaches an address outside the owner's own team, and its recovery link allows the lifter to set a new password.

**PRD trace:** Accounts: Signup, Login & Password Reset — Acceptance criterion 3.

### AC-4 — Account-isolated deletion

Deleting an account removes that account's data and nothing belonging to another account.

**PRD trace:** Accounts: Signup, Login & Password Reset — Acceptance criterion 4.

### PRD-defined failure states

The following edge cases must be addressed in the design/spec and verified appropriately:

* Signing up with an email already associated with an account fails without disclosing more than necessary.
* Password-reset requests for known and unknown addresses receive equivalent outward responses.
* Account deletion cannot be initiated by anyone other than the signed-in owner.

**PRD trace:** Accounts: Signup, Login & Password Reset — Edge cases / failure states.

### Additional roadmap completion conditions

The Pitch Roadmap also explicitly requires that a new person can independently create an account, sign in, and recover a forgotten password, and that deletion removes only the correct account's data.

The PRD feature description and user journeys additionally specify login, logout, profile editing, and the full account lifecycle.

These are binding scope requirements. However, the PRD does not currently express all of them as individually testable acceptance criteria.

**Upstream documentation gap:** The PRD should add explicit acceptance criteria for login/logout, profile edits, timezone capture/editing, and confirmation before deletion.

Do not silently pretend those criteria already exist in the PRD. Preserve the behavior in scope and record the proposed amendment.

---

## 8. Rabbit holes

### 8.1 Registration before isolation is ready

The most important dependency is not the signup form itself. It is proof that Multi-User Foundation has safely established ownership and account-scoped access in production.

A functioning registration screen is not evidence that this prerequisite has been met.

The run must not enable production registration before the earlier foundation's rollout gate is satisfied.

### 8.2 Client-side invite-code validation

It may be tempting to check the invite code entirely in the browser for a smoother registration flow.

That would undermine the invitation gate.

The approved architecture requires server-side validation. The design/spec should use that decision without inventing a competing invitation model.

### 8.3 Email delivery appears successful but is not

A password-reset request may complete without a useful email reaching the lifter.

This is especially relevant because Supabase's default sender is insufficient for the intended users.

The pitch requires a working delivery path to a non-team email address, not merely a successfully submitted reset request.

Provider configuration, sender-domain verification, and related external prerequisites must be represented honestly in the runbook.

### 8.4 Password recovery reveals account membership

Different confirmation messages for known and unknown email addresses could disclose which people have Overload accounts.

The PRD explicitly requires equivalent responses.

Recovery must not become an account-discovery mechanism.

### 8.5 Account deletion and shared records

Account deletion is intentionally destructive, but only within the requesting account.

A broad delete operation that includes another account's data, shared exercise-library records, or otherwise unrelated content is unacceptable.

The account-deletion mechanism must respect the ownership foundation and the special status of shared data.

### 8.6 Partial deletion

Deleting an account may involve several related groups of owned records and the underlying authentication identity.

A failure halfway through could leave the account or its data in an inconsistent state.

The Architecture Doc identifies a dedicated deletion mechanism. The design/spec must address this risk rather than improvising independent destructive operations throughout the application.

### 8.7 Deletion without meaningful confirmation

A routine Settings action and permanent removal of irreplaceable training history must not be treated as equivalent operations.

Confirmation must communicate what the lifter is agreeing to.

The exact interaction belongs to UI design, but an incidental or ambiguous deletion action does not satisfy this pitch's intended behavior.

### 8.8 Overbuilding authentication

It may seem sensible to add email verification, MFA, password-policy customization, third-party sign-in, per-friend invitation tokens, or an administrator interface while implementing accounts.

Those additions are outside this pitch.

The objective is a reliable, minimal account lifecycle for a small group, not a generalized identity platform.

### 8.9 Building onboarding prematurely

The signup flow is the entry point for new lifters, so it would be easy to start adding a tour, product explanations, or a welcome experience.

Those belong to the separate Onboarding Tour and Personalization pitches.

This pitch should make the account usable without prematurely designing those later experiences.

---

## 9. No-gos

* Do not allow signup without a valid invite code.
* Do not expose the invite code in client-side configuration.
* Do not enable production signup before Multi-User Foundation is verified in production.
* Do not introduce public registration.
* Do not add email verification, social login, or MFA.
* Do not expose whether an account exists through password-reset responses.
* Do not introduce roles, an admin console, or cross-account visibility.
* Do not delete training history through ordinary profile edits or authentication operations.
* Do not delete another account's data when an account is removed.
* Do not modify the shared exercise library as part of account deletion.
* Do not create a plan-import or automatic programming feature.
* Do not implement onboarding, greeting personalization, appearance settings, or navigation redesign.
* Do not change the progression engine or the existing logged-history model.
* Do not add a second application-data access architecture.

---

## 10. Dependencies

### Prior feature dependency

**Account Ownership & Isolation**, delivered by Multi-User Foundation.

This must be implemented and verified in production before registration is enabled for additional real users.

The feature supplies the account-ownership and authorization substrate on which every account journey depends.

### Existing system dependencies

**Supabase Auth**

Continues to provide email-and-password identity, authentication sessions, and password recovery.

**Existing Overload application**

The currently shipped application, training workflows, and Settings structure must continue operating as before for the original account.

### New external prerequisite

**Transactional email provider and sending domain**

Supabase's built-in email delivery is insufficient for password-reset messages to arbitrary invited friends.

The Architecture Doc recommends Resend using custom SMTP and a verified sending domain.

Provider integration belongs to this pitch. Domain ownership, DNS verification, credential provisioning, and any other real-world configuration requiring operator authority belong in the runbook.

### Downstream features enabled

**Personalization & Navigation Polish**

Uses the first name collected by Accounts.

**Onboarding Tour**

Relies on real user accounts and follows the navigation work in Personalization & Navigation Polish.

**What's New**

Uses per-account state and therefore depends on the established account lifecycle.

The completion of Accounts also allows the owner to seed a friend's written workout plan through the separately governed operator process.

---

## 11. Release and rollout boundary

This pitch changes authentication, signup, password recovery, profile handling, and account deletion. It also introduces a transactional email dependency.

Because those operations affect access to production accounts and include an irreversible deletion capability, this pitch requires deliberate human review before merge.

The implementation pipeline should produce the completed feature, its UI preview, tested authentication flows, required isolation tests, external email configuration instructions, and a runbook for production readiness.

The production rollout must preserve the following conditions:

1. Multi-User Foundation has been verified in production before registration is enabled.
2. The invite gate is active before new real users can register.
3. Recovery email delivery has been verified using an address outside the owner's own Supabase team.
4. Account deletion has been tested for complete removal of the requesting account's data without affecting another account.
5. Production configuration and credentials are handled as human-authorized steps.

A green implementation branch is not automatic permission to enable production signup.

The broader roadmap recommends inviting friends after Onboarding Tour has shipped. Accounts makes self-service access possible; it does not by itself mark the entire first-impressions experience complete.

---

## 12. Risks and judgment points

### Account deletion is irreversible

The product's normal history-preservation invariant has one explicit exception: user-confirmed account deletion.

The design/spec must treat that exception as a narrow, dedicated capability rather than a reason to weaken ordinary historical-data protections.

### Transactional email depends on external configuration

Password recovery cannot be considered complete without functioning delivery.

The external dependency should be represented honestly in the implementation report and runbook, particularly where a verified sender domain or operator-provided credentials are unavailable during the autonomous build.

### Authentication changes affect the existing user

The original production account must retain access and all of its training information.

Signup and login changes must not accidentally force account recreation, assign a new identity, or disconnect existing data.

### Timezone defaults influence core training behavior

New accounts require a valid timezone so the product knows their local training day.

The foundation already establishes account-relative date behavior. This pitch supplies signup capture and profile editing without introducing a second competing day-calculation mechanism.

### Simplicity is a product requirement

The system is for a small invited group, not a public platform.

A conventional, reliable account experience is sufficient. Additional identity complexity should not be treated as inherently better.

---

## 13. Open questions and source gaps

### Settled decisions to adopt

The project's standing multi-user decisions already establish the following directions:

* Invite-code gate: one shared, server-side code.
* Password rules: Supabase defaults, without custom complexity requirements.
* Password recovery: Supabase recovery flow with outwardly identical known/unknown-email responses.
* Email provider: Resend through custom SMTP as the recommended default.
* Account deletion: a dedicated deletion mechanism and explicit confirmation.
* Timezone: browser-detected at signup and editable in Settings.

These should be adopted by the downstream pipeline rather than re-derived unless the current approved repository documentation has superseded them.

### Real-world configuration requiring human involvement

The exact verified sending domain and production email credentials cannot be established by this pitch.

They must be supplied through the appropriate operator-controlled setup process.

### Documentation inconsistency

The Pitch Roadmap still describes the invite-code gate as pending a decision, but the Architecture Doc requires it and the pipeline guide's standing resolutions identify it as approved.

**Resolution for this pitch:** Include the required invite-code gate, following the more specific approved architecture and standing decision. Record the stale roadmap wording as a required upstream amendment rather than removing the gate or reopening the decision.

### Acceptance-criteria gap

The PRD explicitly defines acceptance criteria for registration, invite enforcement, password recovery, and deletion isolation, but does not individually enumerate all the login, logout, profile, timezone, and deletion-confirmation behavior described in its feature inventory and user journeys.

These remain in scope.

The recommended upstream amendment is to make those existing behavior requirements independently traceable as acceptance criteria. The downstream spec should not treat that as permission to invent additional product functionality.

---

## 14. Handoff to design and spec

This is a **UI-bearing pitch**.

The required artifact sequence is:

**Pitch → Design Doc → UI Preview → Spec → Tickets → Implementation**

The design-doc stage should establish the user-facing flows, states, hierarchy, and interactions for signup, login, recovery, profile editing, and deletion confirmation.

The UI-preview stage should produce the visual contract for those screens and relevant responsive states using Overload's existing design system.

The spec stage should determine the technical implementation: authentication integration, validation, profile behavior, recovery lifecycle, account-deletion mechanics, security boundaries, and test requirements.

The ticket-worker stage should implement the complete vertical capabilities, not separate the account interfaces from their backend functionality into disconnected pitches.

All downstream work must preserve these fixed product outcomes:

* Registration is invite-only.
* Every new lifter enters their own private account.
* Existing accounts can sign in and sign out.
* Password recovery works through actual delivered email.
* Recovery does not expose account membership.
* Profile information and timezone can be managed by the owner.
* Account deletion requires explicit confirmation and affects only the requesting account.
* The original account's identity and training data remain intact.
* No onboarding, personalization, social, or administrative functionality is pulled into this pitch.
* Production rollout respects the Multi-User Foundation gate and human-controlled production operations.

**End of pitch.**
