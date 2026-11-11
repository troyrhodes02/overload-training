**Proposed Pitch Number:** 19 — pending authoritative roadmap renumbering
**Original Roadmap Number:** 20
**Type:** Feature
**Status:** Planned — Next in the revised sequence
**Phase:** MVP 4 — Commercial Launch & Operations
**Appetite:** L — Large
**Depends on:** Admin Center & Feedback; Public Accounts, Recovery & Support; existing private-account and training features
**Platform:** Web-first; desktop and mobile browsers
**UI-bearing:** Yes
**Merge Behavior:** Stop before merge

---

## 1. Problem

Overload has evolved from a personal training application into a product intended for public use.

Its training features are already substantial.

Lifters can create their own splits and mesocycles, record performed workouts, maintain exercise history, manage multiple gyms, track strength goals, and receive evidence-based progression recommendations.

The next commercial challenge is not adding another training metric.

It is establishing a sustainable business model without compromising the training experience.

Overload needs to answer several important questions:

* What functionality can every lifter use for free?
* What additional value does a Pro subscription provide?
* How can a new user experience Pro before deciding whether to pay?
* What happens when a trial expires?
* What happens if a subscription is canceled or a payment fails?
* How can promotional offers such as BLIZZY be applied correctly?
* How can the owner provide free access to friends, creators, and testers?
* How can Overload reliably determine which capabilities an account is entitled to use?
* How can the owner understand subscription activity without handling card information?

There is also a fundamental trust issue.

Lifters invest significant time entering workout plans, performed sets, and historical performance.

That information belongs to them.

Overload must never make users feel that their own training records are being held hostage by a subscription.

A lifter whose trial expires should not lose their workout history.

Someone who cancels Pro should still be able to log training, update plans, track goals, and export their data.

The commercial offering must therefore charge for Overload's additional interpretation of training data, not for the user's ability to keep their own records.

The problem this pitch solves is:

**Introduce a trustworthy Free and Pro subscription model that monetizes Overload's training intelligence while preserving unrestricted access to personal training data and essential logging.**

---

## 2. Appetite

**L — Large**

This pitch includes several interconnected systems that must function as one complete commercial capability:

* Free and Pro feature boundaries.
* Server-enforced capability access.
* A 14-day Pro trial.
* Paid monthly and annual subscriptions.
* Stripe Checkout and customer self-service.
* Promotional discounts.
* Subscription lifecycle handling.
* Failed-payment grace periods.
* Complimentary Pro access.
* Administrative billing visibility.
* Existing-account transition.
* Upgrade messaging.
* Billing verification and operational readiness.

The most significant complexity lies in correctness rather than presentation.

Subscription events can arrive late, more than once, or out of order.

Trials and complimentary access can overlap with paid subscriptions.

An account can lose paid access without losing ownership of its records.

Administrative comp grants must not affect payment-provider state.

A visually hidden Pro feature must also be protected at the server.

The feature is large but remains one coherent vertical slice: the user can understand the plans, subscribe, receive the correct access, manage billing, and return safely to Free.

Splitting only the billing backend from the subscription interface would leave an incomplete commercial feature.

The downstream specification and implementation tickets may divide the work into manageable parts without changing the pitch's unified product outcome.

---

## 3. Value delivered

When complete, Overload offers two plans:

**Free** gives lifters a complete workout-recording experience.

**Pro** adds the training intelligence that makes Overload different from a conventional logging application.

New accounts receive 14 days of Pro without supplying a payment card.

Users can choose a paid subscription, enter a valid promotional code, and manage or cancel billing through a trusted payment-provider experience.

The owner can grant complimentary Pro access to selected accounts, including founding members, without creating subscriptions or collecting payments.

The application enforces each account's current capabilities consistently.

If a trial ends or paid access lapses, the account returns to Free.

**No workout history, training plan, logged set, goal, or user-owned record is deleted because of a downgrade.**

This creates a commercial foundation that supports the planned public launch without compromising the core training product.

---

## 4. Solution shape

### 4.1 Two plans: Free and Pro

Overload introduces two subscription plans.

Free is a permanent, functional training tracker.

Pro includes the additional analytical and recommendation capabilities.

There are no advertisements in either plan.

The controlling principle is:

**Capture is free. Interpretation is paid.**

The application must preserve this distinction across existing features and future additions.

### 4.2 Free plan capabilities

The Free plan includes the functionality required to create, execute, and preserve a complete training program.

Free users can:

* Build splits, mesocycles, and training sessions.
* Configure the scheduled deload week.
* Create and edit planned exercises, sets, and repetition ranges.
* Duplicate sessions and clone mesocycles.
* Plan and log cardio.
* Log workouts using the existing guided logging experience.
* Record weights, repetitions, and optional reps in reserve.
* Log pure bodyweight movements.
* Swap exercises during a workout.
* Resolve missed training days.
* Search and use the exercise library.
* Create and manage custom exercises.
* Manage gyms and their applicable working-weight baselines.
* Review their complete logged training history.
* Correct historical logged sets.
* Create and track strength goals, including their established progress calculations.
* Export their account data.
* Manage their account and request deletion.
* Use the existing feedback and support experience.

The Free plan must remain useful independently.

The application must not require Pro simply to record a new set or access previously entered training information.

Scheduled deload behavior remains part of the training plan and is not disabled when Pro ends.

### 4.3 Pro plan capabilities

Pro adds Overload's interpretation of recorded performance.

The documented Pro offering includes:

* Progress, hold, and reactive-deload recommendations.
* Actionable suggested increases where the existing engine supports them.
* The evidence explaining recommendations.
* e1RM trends and stall detection.
* Use of reported RIR in progression recommendations.
* Exercise History & PR Intelligence.
* Workout Plan Import & Review when that later pitch ships.

These capabilities distinguish Pro from Free.

The underlying training data remains owned by the account on either plan.

For example, a Free user can still record RIR, but the Pro-specific use of RIR to produce progression recommendations is unavailable.

Likewise, a Free user's existing logged sets remain intact even when the e1RM trend or PR intelligence interface is unavailable.

The existing progression engine's approved rules must not change merely because access is now subscription-dependent.

### 4.4 Clear treatment of existing Pro surfaces

Several Pro features have already shipped and are currently available within the invite-only product.

Introducing plans means those existing surfaces need an appropriate Free experience.

A Free user should not encounter broken pages, misleading recommendations, or unexplained missing content.

Where a Pro capability would normally appear, the application may present a restrained explanation that the feature belongs to Pro.

The updated roadmap requires upgrade messaging to be:

* Quiet.
* Dismissible.
* Limited to one place per screen.
* Free of countdowns, banners, and other pressure tactics.

Pro gating must not interfere with nearby Free functionality.

A user must still be able to access basic workout history and logging even if an adjacent advanced analytics feature is unavailable.

### 4.5 Capability-based access

Overload's plans must grant named capabilities.

Application behavior must be determined by the capabilities available to the authenticated account, rather than by scattered checks for a plan name.

The architecture explicitly requires capability enforcement on the server.

The user interface may adapt to available capabilities, but hiding a control cannot be the only protection.

A Free account must not receive a Pro-only result by directly invoking a server action or manipulating client state.

The design/spec process determines the exact capability names and their mapping to existing features.

The distinction between **permissions** and **capabilities** must remain intact.

An entitlement grants product functionality.

It never grants access to another user's data or administrative privileges.

### 4.6 Fourteen-day Pro trial

Every newly registered account begins with a 14-day Pro trial.

No payment card is required to begin it.

The trial begins at signup.

During the trial, the account has the documented Pro capabilities.

The user may explore progression recommendations, training analytics, and other available Pro functionality without first subscribing.

The eventual plan-import feature will also be available during the trial once it ships.

The trial must not create a paid subscription automatically.

If the user does not subscribe, the trial ends and the account moves to Free.

Logging remains available.

No training data is deleted.

### 4.7 Trial expiration

Trial expiration changes the capabilities available to the account.

It does not alter the ownership or preservation of the account's information.

When the trial ends:

* Free features remain available.
* Pro-only analysis and related interfaces become unavailable.
* The user can still review their full basic training history.
* Existing logged weights, repetitions, RIR, goals, and plans remain intact.
* The user can subscribe to regain Pro capabilities.

The transition must be determined reliably even if the user has not opened Overload since the trial ended.

The application must not rely on a user visiting a specific page to update their access.

The spec must establish how trial dates are interpreted consistently.

### 4.8 Existing accounts and founding members

Overload already has real accounts and training history.

Those users existed before the commercial entitlement system.

The roadmap explicitly states that existing accounts should receive complimentary Pro access as founding members.

This must use the same approved complimentary-access mechanism available to the owner.

It must not require creating artificial paid subscriptions.

Founding-member access should not be misreported as subscription revenue.

Existing training data and account ownership must remain unchanged during the transition.

The necessary account-state migration, verification, and production execution steps belong to the downstream specification and human-operated runbook.

### 4.9 Paid subscriptions

Pro is offered through monthly and annual subscriptions.

The documented proposed prices are:

* **Monthly:** $4.99.
* **Annual:** $39.99.

These are owner-controlled prices that must be confirmed before live billing is activated.

The interface must communicate the selected billing period and applicable charge clearly.

A user must be able to understand what they are purchasing before entering Checkout.

This pitch does not authorize other subscription tiers.

### 4.10 Stripe-hosted checkout

Stripe Billing is the approved payment provider.

Overload uses hosted Checkout for subscriptions.

The user leaves the application for the provider's supported checkout experience and returns to an appropriate account or billing state afterward.

Overload must not collect, store, or process payment-card numbers.

A browser return from Checkout is not, by itself, proof of a successful subscription.

The account's paid entitlement must follow the verified authoritative billing state established by the approved Stripe integration.

The spec stage defines the detailed purchase and return behavior.

### 4.11 Customer self-service billing

A paying customer must be able to manage their subscription without contacting the owner.

Stripe's Customer Portal is the approved self-service destination.

The application should provide an appropriate account-level entry point for managing payment details, subscription renewal, and cancellation using the supported portal functionality.

Overload should not create a parallel billing-administration system.

The customer must be able to understand whether their access is currently trial, paid, complimentary, or Free.

An unpaid or complimentary account must not be falsely represented as a paying customer.

### 4.12 Subscription lifecycle

Overload needs to correctly reflect relevant subscription states.

The experience must account for:

* A newly completed subscription.
* An active renewing subscription.
* A customer canceling renewal.
* A subscription ending.
* A failed recurring payment.
* The applicable grace period.
* A subscription returning to good standing.
* A promotional discount ending.
* A user with another valid entitlement source.

The application must not make paid access dependent solely on the most recent browser navigation or checkout-return message.

The documented architecture requires authenticated, idempotent handling of Stripe subscription events.

It also establishes that billing events may arrive late, twice, or out of order.

The spec must define how those cases affect the account's actual entitlement.

### 4.13 Failed-payment grace period

A failed recurring payment should not cause an immediate, unexplained loss of Pro access.

The updated pipeline guide proposes a configurable **seven-day grace period**.

This is a conservative default, not a universal billing rule.

During the approved grace period, the user's capabilities follow the documented entitlement policy.

If payment is recovered, the account continues with the appropriate paid access.

If the grace period expires without recovery and no other valid entitlement exists, the account moves to Free.

No training records are deleted.

The owner must confirm the grace-period policy before production billing is enabled.

### 4.14 Overlapping entitlements

An account may have more than one reason to qualify for Pro.

For example, a founding member may receive complimentary access and later purchase a subscription.

A trial may still be running when the user subscribes.

A paid subscription may expire while an approved complimentary grant remains active.

Overload must resolve these situations consistently.

It must not incorrectly remove Pro access merely because one entitlement source ended while another remains valid.

Likewise, an account receiving complimentary access must not be misrepresented as a paying customer.

The architecture identifies three entitlement sources:

* Trial.
* Subscription.
* Complimentary grant.

The spec should define how those sources are evaluated together, preserving the approved separation between product access and payment-provider state.

### 4.15 Complimentary Pro access

The owner can grant an account full Pro access without charging it.

This capability is managed through the existing owner-only Admin Center & Feedback area.

A complimentary grant must include a reason.

Examples identified by the roadmap include:

* Friend.
* Creator.
* Tester.
* Founding member.

A grant may have an optional end date.

The owner can revoke it.

Granting and revoking complimentary access must be audited.

A complimentary grant is not a paid subscription.

It must not create or modify a Stripe subscription.

It must not grant administrator privileges.

The account simply receives the appropriate Pro capabilities for the valid grant period.

### 4.16 Complimentary-access administration

The existing admin center gains the controls needed to manage complimentary Pro access.

The owner should be able to identify an account, understand its applicable entitlement source, and grant or revoke complimentary access according to the approved rules.

The interface should distinguish complimentary and paid access clearly.

Administrative entitlement changes require the same owner-only authorization and audit guarantees as the existing admin actions.

No ordinary lifter may grant complimentary access to themselves or another account.

The admin interface continues to show permitted account metadata and aggregate information only.

It does not gain access to workout plans, logged sets, goals, gyms, or cardio.

### 4.17 BLIZZY promotion

The first planned promotional campaign is **BLIZZY**, associated with the creator whose training content will feature Overload.

The documented offer is:

**50% off the first three months of a monthly Pro subscription, capped at 200 redemptions.**

The offer is entered at Checkout using Stripe's promotion-code functionality.

It is intended for first-time customers.

The discount ends after its defined duration.

Afterward, the subscription continues at its applicable regular price unless the customer cancels.

The checkout experience must communicate these terms clearly.

The exact Stripe coupon-duration semantics, particularly interaction with trials and billing periods, must be verified during the design/spec and test-mode validation.

Do not approximate three months using an invented number of days or billing events.

The roadmap's proposed offer must be represented faithfully.

### 4.18 Promotion limits and invalid codes

The promotional system must enforce the conditions attached to the actual provider-managed offer.

This includes:

* Promotion-code validity.
* First-time-customer restrictions.
* Redemption limits.
* Applicable subscription products.
* Discount duration.

An invalid or exhausted code must not silently receive the discount.

A legitimate customer should receive an understandable provider-supported outcome.

A redemption must not be counted as a confirmed paid conversion merely because someone typed a code into a field.

The application should rely on verified billing outcomes for its administrative reporting.

### 4.19 Promotional price disclosure

The lifter should know what they will pay and when.

For a discounted monthly subscription, the experience must clearly distinguish:

* The promotional price.
* The promotional duration.
* The regular recurring price afterward.
* Whether billing renews automatically.
* How to cancel.
* Any applicable taxes or additional charges shown at checkout.

Do not conceal the full future price behind the promotion.

Do not present BLIZZY as a permanent discounted subscription.

The exact wording belongs to the design stage, and the authoritative values must match the configured billing products and promotion.

### 4.20 Billing and subscription status

The signed-in account experience should communicate the user's current access state.

A user should be able to distinguish between:

* Free.
* Active Pro trial.
* Paid Pro.
* Complimentary Pro.
* A subscription with an upcoming cancellation.
* A subscription experiencing a payment problem, where applicable.

This information should be actionable without becoming intrusive.

A user who is already entitled to Pro should not receive misleading prompts to purchase the same access.

The spec must establish how displayed status remains consistent with actual entitlement state.

### 4.21 Read-only administrative billing visibility

The owner-only admin center gains visibility into the operational billing information identified by the roadmap.

The owner can see relevant subscription status and promotion-redemption information.

The experience should support understanding which subscriptions resulted from applicable promotional codes.

However, administrative billing visibility is read-only with respect to Stripe subscription state.

The owner cannot arbitrarily edit payment amounts, subscription status, or card information from Overload's admin panel.

Complimentary access is the specifically permitted exception because it is an Overload entitlement source rather than a Stripe subscription.

The existing administrative privacy boundary remains unchanged.

### 4.22 Reliable billing event handling

The application must not trust unauthenticated billing notifications.

Only verified Stripe events may establish or update mirrored subscription state.

Processing the same event more than once must not duplicate subscriptions, redemptions, or entitlement effects.

Late and out-of-order events must not cause an account to receive a contradictory or stale entitlement.

The architecture's payment-provider authority and idempotency requirements are fixed.

The downstream spec owns the exact event contracts, reconciliation rules, and verification.

This pitch does not authorize a second authoritative billing system.

### 4.23 Tax handling

Before collecting real payments, Overload needs an explicitly recorded tax-handling decision.

The updated pipeline guide specifies that Stripe Tax should be enabled only if the owner is registered as required.

The owner must determine the relevant business registration and tax obligations.

The implementation should not silently infer tax registrations, legal nexus, or compliance status.

Any actual tax-related production configuration is an owner-controlled human operation.

The full test-mode purchase flow must be verified independently from making a real charge.

### 4.24 Production payment gate

This pitch builds and tests the commercial system.

It does **not** authorize collecting real customer payments.

The updated roadmap states that payment collection remains disabled until **Launch Readiness & Closed Beta** passes its evidence-based checklist and the owner signs off.

Stripe test mode is used for the implementation and autonomous verification.

Switching to live payments remains a separate human action.

A successfully completed billing feature is necessary for a paid launch but is not sufficient authorization to launch.

### 4.25 Web-first checkout and future mobile compatibility

This feature is intentionally complete on the web.

The owner has postponed the iOS Foundation because the available Mac cannot reliably support the required current native development workflow.

Rather than begin Capacitor development and leave it unfinished, native mobile work will resume later as one complete foundation pitch.

Accordingly, this pitch supports:

* Desktop-browser subscription purchase.
* Mobile-browser subscription purchase.
* Browser-based return from hosted Checkout.
* Browser-based Customer Portal access.
* Responsive account and pricing interactions.

It does not implement:

* Capacitor.
* Native purchase sheets.
* App Store in-app purchase.
* Google Play Billing.
* Universal Links.
* Native checkout return handling.
* TestFlight.
* Platform-specific payment adapters.

The shared entitlement concept must remain compatible with future mobile access, but no partial native implementation is authorized.

Store-specific purchase rules will be resolved in the appropriate future mobile-release pitches.

---

## 5. Primary user journeys

### Journey A — New lifter begins Pro trial

1. A lifter registers for Overload.
2. The account receives its 14-day Pro trial.
3. The lifter uses available Pro functionality without entering payment information.
4. The account can access Free training features throughout the trial.
5. The user can review their trial and subscription options.

### Journey B — Trial expires without payment

1. The trial reaches its end.
2. No valid paid or complimentary entitlement remains.
3. The account moves to Free.
4. The user can continue logging workouts and managing training.
5. Pro-only intelligence is no longer available.
6. Previously entered data remains intact.

### Journey C — User subscribes to Pro

1. The lifter reviews the Pro offering.
2. They choose the monthly or annual subscription.
3. They enter the trusted hosted checkout experience.
4. They complete the payment-provider flow.
5. Overload recognizes the verified subscription state.
6. The account receives the applicable Pro capabilities.
7. The account can manage billing through the Customer Portal.

### Journey D — User applies BLIZZY

1. A prospective subscriber reaches Checkout.
2. They enter BLIZZY.
3. Stripe evaluates the promotion's eligibility.
4. If eligible, the approved discount is applied.
5. The customer sees the promotional terms and future renewal price.
6. The subscription proceeds through hosted Checkout.
7. Verified billing state determines the resulting paid entitlement.

### Journey E — Promotional period ends

1. The customer's introductory discount reaches its documented end.
2. The underlying subscription continues according to its terms.
3. The regular recurring price applies to subsequent eligible billing periods.
4. The account retains paid Pro access while the subscription remains valid.

The discount does not silently become permanent.

### Journey F — User cancels renewal

1. The lifter opens subscription management.
2. They use the supported Customer Portal cancellation process.
3. Overload reflects the verified subscription state.
4. The user's entitlement follows the actual cancellation effective date.
5. When no Pro source remains, the account moves to Free.
6. Training data remains intact.

### Journey G — Payment fails

1. Stripe reports a qualifying recurring-payment failure.
2. Overload reflects the approved grace-period behavior.
3. If payment is recovered, valid paid access continues.
4. If the grace period ends without recovery and no other entitlement remains, the account moves to Free.
5. Logging, history, export, and account management remain available.

### Journey H — Owner grants complimentary access

1. The owner opens an account in the existing admin center.
2. They grant Pro access with a reason and optional end date.
3. The action is authorized and audited.
4. The recipient gains Pro capabilities.
5. No payment or Stripe subscription is created.

### Journey I — Owner revokes complimentary access

1. The owner locates an account's complimentary grant.
2. They revoke it.
3. The action is audited.
4. The account's current access is recalculated using any remaining valid entitlement sources.
5. If no Pro entitlement remains, the account has Free access.

### Journey J — Existing founding member

1. An account created before the commercial plan system is recognized.
2. It receives the approved founding-member complimentary entitlement through the established mechanism.
3. Its historical training information is unchanged.
4. The account is identified as complimentary rather than paying.

### Journey K — Free user tries Pro analytics

1. A Free user reaches a location where an advanced progression insight would normally appear.
2. Overload does not provide the Pro-only result.
3. A restrained upgrade explanation is displayed where appropriate.
4. The user can continue using the surrounding Free features.

### Journey L — Owner reviews commercial activity

1. The owner opens the admin center.
2. They inspect permitted billing status and promotion information.
3. They distinguish paying, trial, Free, and complimentary accounts.
4. They can grant or revoke complimentary access.
5. They cannot manipulate Stripe subscription state or access private workout content.

---

## 6. In scope

This pitch includes:

 1. Free and Pro plans.
 2. The documented plan capability split.
 3. Named, server-enforced capabilities.
 4. Fourteen-day card-free Pro trials.
 5. Correct expiration to Free.
 6. Monthly and annual Pro subscriptions.
 7. Stripe-hosted Checkout.
 8. Stripe Customer Portal.
 9. Reliable subscription lifecycle handling.
10. Verified, idempotent billing-event processing.
11. Failed-payment grace-period behavior.
12. The BLIZZY promotional offer.
13. First-time-customer restrictions and redemption limits.
14. Promotional discount expiration.
15. Clear checkout and renewal disclosures.
16. Complimentary Pro access.
17. Founding-member complimentary entitlements.
18. Owner-side complimentary-access management and auditing.
19. Read-only administrative subscription and promotion visibility.
20. Restrained Free-to-Pro upgrade messaging.
21. Preserved access to all Free training-data functions.
22. Browser-based mobile and desktop purchase flows.
23. Tax-handling decision and test-mode verification.
24. Guidance and release-note maintenance through the existing mechanisms.

The capability system must apply consistently to already-shipped Pro features rather than protecting only new billing screens.

---

## 7. Out of scope

### Native iOS and Android billing

No StoreKit, Apple in-app purchase, Google Play Billing, native checkout, or native subscription-management interface.

### iOS Foundation

No Capacitor project, native adapters, Xcode setup, TestFlight, Universal Links, or native session handling.

### Live payment collection

No switching Stripe to live mode, collecting real charges, or activating production paid subscriptions as part of an autonomous implementation run.

### Public landing page and creator marketing site

The public landing page, dedicated `/blizzy` page, public pricing page, and public changelog belong to the following planned marketing pitch.

This pitch may provide the authenticated billing and checkout entry points they will use later.

### Workout plan import

Plan Import & Review is a later feature.

This pitch establishes its Pro capability boundary but does not implement the import workflow or external model integration.

### Additional subscription tiers

No lifetime plan, six-month plan, family plan, team plan, or advanced coaching tier.

### Referral programs

BLIZZY is a promotional code, not a multi-level referral or affiliate-payment platform.

### Creator payouts

No automatic commission calculations, referral payouts, or creator financial accounts.

### Custom payment processing

No card-entry forms, payment-token storage, or direct handling of payment credentials.

### New training logic

No changes to progression thresholds, e1RM formulas, RIR qualification rules, scheduled deloads, or gym-specific baseline calculations.

### Ads or coercive upgrade experiences

No advertising, countdown timers, artificial urgency, intrusive banners, or repeated upsell interruptions.

---

## 8. Definition of done

The updated Pitch Roadmap establishes six formal completion criteria.

### AC-1 — Correct trial lifecycle

A new account receives Pro for 14 days.

When the trial ends without another valid Pro entitlement, the account becomes Free.

All training data remains intact and logging continues uninterrupted.

**Source:** Pitch Roadmap — Plans, Billing & Promo Codes, Definition of Done 1; PRD — Plans, Billing & Promo Codes.

### AC-2 — Server-enforced Pro access

A Free account cannot obtain Pro-only results through any supported interface or direct server-action invocation.

The access rule must operate independently of which controls are visible in the browser.

**Source:** Pitch Roadmap — Definition of Done 2; PRD — Plans, Billing & Promo Codes.

### AC-3 — Complimentary access

The owner can grant and revoke complimentary Pro access.

Grants have the required reason and optional expiration.

Administrative changes are audited.

A complimentary account is never presented as a paying subscriber merely because it has Pro capabilities.

**Source:** Pitch Roadmap — Definition of Done 3; PRD — Plans, Billing & Promo Codes.

### AC-4 — Authenticated, idempotent billing events

Subscription state is established through verified Stripe events.

Processing an event more than once does not duplicate or incorrectly change entitlement state.

**Source:** Pitch Roadmap — Definition of Done 4; PRD — Plans, Billing & Promo Codes.

### AC-5 — Promotional duration and redemption limits

A qualifying promotional code applies its documented discount for the approved duration.

The discount ends when that duration ends.

The code cannot continue accepting new redemptions after its configured limit is reached.

**Source:** Pitch Roadmap — Definition of Done 5; PRD — Plans, Billing & Promo Codes.

### AC-6 — Payment failure and card-data safety

The failed-payment path follows the approved grace-period behavior.

Overload does not store payment-card data.

**Source:** Pitch Roadmap — Definition of Done 6; PRD — Plans, Billing & Promo Codes.

### Supporting scope commitments

The roadmap's Included scope also requires:

* Complete Free access to training capture and history.
* Clear separation of paid and complimentary access.
* Customer self-service billing.
* Clear renewal and discount disclosures.
* Existing founding-member treatment.
* Administrative promotion visibility.
* Tax-handling decisions.
* Test-mode checkout verification.

These must be covered by the design and spec, without misrepresenting them as separately numbered roadmap acceptance criteria.

---

## 9. Rabbit holes

### 9.1 Gating a user's own training records

The most damaging commercial failure would be making users pay to retrieve or continue recording their own data.

The Free plan must always preserve capture, history, and export.

### 9.2 Enforcing subscriptions only in the UI

A hidden chart or disabled button does not prevent someone from invoking a server action directly.

Pro-only results require server-side capability enforcement.

### 9.3 Confusing access with account permissions

Pro is a feature entitlement, not an authorization role.

It cannot grant access to another user's data or owner-only administration.

### 9.4 Handling trial expiration unreliably

A trial must not remain active indefinitely merely because the account has not visited the billing page.

Access must reflect the applicable date and valid entitlement sources.

### 9.5 Misrepresenting complimentary users as subscribers

Complimentary access gives Pro capabilities but does not establish payment or revenue.

Administrative reporting must preserve this distinction.

### 9.6 Incorrectly resolving overlapping entitlements

One entitlement ending must not revoke Pro while another valid source remains.

Likewise, expired sources must not keep Pro active incorrectly.

### 9.7 Trusting browser checkout returns

A successful-looking return to Overload is not sufficient proof that a subscription is active.

The authoritative payment-provider state must be verified.

### 9.8 Duplicate or out-of-order billing events

A replayed event must not create another redemption or corrupt the current entitlement.

A late event must not incorrectly overwrite newer authoritative state.

### 9.9 Confusing promotion months with trial time

The BLIZZY offer promises three months of discount on a subscription.

The exact relationship between trial days, billing periods, coupon duration, and promotion eligibility must be verified rather than guessed.

### 9.10 Exceeding promotional redemption limits

The marketing offer must not continue being accepted after the configured redemption cap.

### 9.11 Applying discount terms to the wrong subscription

The BLIZZY offer must match its approved products, billing interval, and first-time-customer restriction.

It must not accidentally discount unrelated subscription products or repeat indefinitely.

### 9.12 Automatically changing plans when a payment fails

The account should follow the approved grace-period policy instead of losing Pro immediately through an unreviewed shortcut.

### 9.13 Gating plan import before it exists

The billing feature establishes the eventual Pro capability.

It must not prematurely implement the AI plan-import workflow.

### 9.14 Expanding the admin privacy boundary

Billing visibility does not authorize the owner to inspect private training records.

Admin functionality remains limited to permitted metadata, aggregate information, and approved administrative actions.

### 9.15 Implementing native checkout because iOS was originally next

The owner has postponed the entire iOS foundation.

Native billing is outside this pitch even if the old roadmap still lists the iOS dependency.

Do not create partial platform integrations.

### 9.16 Making assumptions about tax obligations

Tax handling involves legal and business facts the implementation cannot independently determine.

The owner must confirm the necessary production decisions.

---

## 10. No-gos

* No Pro paywall around workout logging, plan building, historical records, goals, export, or account deletion.
* No ads.
* No Pro authorization based solely on hidden UI controls.
* No capability granted by a client-supplied account identifier.
* No access to another account's private data.
* No complimentary access that becomes an admin role.
* No fake Stripe subscriptions for complimentary users.
* No browser-return event treated as authoritative payment.
* No unsigned billing webhook acceptance.
* No non-idempotent event application.
* No payment-card storage or logging.
* No use of live Stripe credentials by the autonomous run.
* No real payment collection before launch approval.
* No invented or silently changed promotional terms.
* No manipulative upgrade messaging.
* No changes to existing progression calculations.
* No native iOS or Android implementation.
* No partial Capacitor foundation.
* No unapproved tax settings.

---

## 11. Dependencies

### Admin Center & Feedback — required

The completed admin center provides owner authorization, account lookup, and the append-only administrative audit foundation.

Complimentary-access controls and billing visibility extend that existing area without widening its access to training content.

The implemented admin spec and run report remain authoritative.

### Public Accounts, Recovery & Support — required

The immediately preceding web-first feature provides account lifecycle, password recovery, email verification, and export.

Email verification must be available before first checkout.

The completed implementation and specification must be consulted rather than assuming every detail from the earlier pitch draft shipped unchanged.

### Multi-User Foundation — required

Subscription and entitlement records must remain scoped to the correct account.

The existing isolation tests continue to apply.

### Progressive Overload Engine, RIR Logging, Smarter Progression, and Exercise History — required existing capabilities

These shipped features supply the Pro functionality.

This pitch applies access rules to them without modifying their underlying training calculations.

### iOS Foundation & Cross-Platform Workflow — intentionally postponed

The originally uploaded roadmap lists iOS Foundation as a dependency of billing.

The owner has deliberately deferred it until suitable Mac hardware is available.

This pitch implements browser-based billing completely and makes no native purchase-flow assumptions.

Native billing and app-store policies will be handled when the full mobile foundation and subsequent store-release work resume.

This dependency change requires a documented upstream roadmap amendment.

### Public Landing Page & Changelog — downstream

The landing page will use this feature's plan descriptions, subscription entry points, and BLIZZY promotion.

It must not duplicate the authoritative billing logic.

### Workout Plan Import & Review — downstream

Plan import will consume the Pro capability established by this pitch.

It does not ship here.

### Launch Readiness & Closed Beta — downstream

This is the separate gate that authorizes accepting paying strangers.

Completion of the billing feature alone does not satisfy that gate.

---

## 12. User guidance and release notes

The existing Onboarding Tour and What's New mechanisms must be maintained.

This pitch includes a final User Guidance ticket using `/overload-onboarding`.

### Onboarding guidance

The new account-plan and subscription interfaces may warrant discoverability guidance.

The skill should inspect the actual shipped surfaces and determine whether a tour change is appropriate.

Do not force existing users through onboarding again.

Do not introduce a new tour mechanism.

### What's New

A significant entry is appropriate because Free and Pro are major changes to the product's offering.

Illustrative content:

**Introducing Free and Pro**

"Keep planning and logging your workouts for free. Pro adds progression recommendations, performance trends, and deeper exercise insights. New accounts can try Pro free for 14 days."

The final entry must reflect the actual deployed behavior.

It must not announce live subscriptions or public payment availability before they are enabled.

Use the established release-note mechanism and actual shipping date.

### Billing guidance

Users should be able to understand the trial, current access, renewal terms, promotional discounts, and cancellation without needing a support conversation.

The UI design stage owns the exact wording and hierarchy.

---

## 13. Risks and verification focus

### Free capability preservation

Verify that Free users can continue building plans, logging workouts, recording RIR, reviewing full basic history, correcting logs, managing goals, and exporting their information.

### Pro capability enforcement

Verify that Free accounts cannot obtain progression intelligence, e1RM trends, advanced exercise intelligence, or other Pro-only results through direct server calls.

### Trial correctness

Verify the complete trial lifecycle, including expiry without a subscription and transitions to Free.

### Existing-account migration

Verify founding-member complimentary access without changing original training data or presenting complimentary accounts as paid.

### Complimentary grants

Verify authorization, audit entries, expiry, revocation, and coexistence with other entitlement sources.

### Billing-event security

Verify webhook signatures, idempotency, event ordering, and account association.

### Subscription lifecycle

Verify active, canceled, expired, failed-payment, recovered-payment, and grace-period behavior.

### Promotional correctness

Verify BLIZZY eligibility, discount duration, redemption limits, and subsequent regular-price renewal in Stripe test mode.

### Admin privacy

Verify that billing additions do not expose private training records.

### Account isolation

Verify that no account can read or manipulate another account's billing or entitlement information.

### Data retention

Verify that expiration, downgrade, cancellation, or failed payment never deletes or alters training history.

### Browser behavior

Verify subscription purchase and management through supported desktop and mobile browsers.

### Production safety

No real charge, live billing activation, or production migration occurs during the autonomous implementation run.

---

## 14. Open questions and required upstream amendments

### Approved decisions already established

The updated planning documents and pipeline guide establish:

* Free and Pro as the two plans.
* No advertisements.
* Capture, history, and export remaining Free.
* Pro progression recommendations, trends, and advanced exercise intelligence.
* A 14-day card-free Pro trial.
* Stripe-hosted Checkout and Customer Portal.
* Capability-based server enforcement.
* Trial, subscription, and complimentary entitlement sources.
* Complimentary founding-member treatment.
* BLIZZY as a three-month promotional offer.
* An initial 200-redemption cap.
* Idempotent billing-event handling.
* No native checkout in this feature.

These decisions should not be silently reopened by implementation.

### Owner confirmation before live billing

The following have financial or operational consequences and require explicit owner confirmation before their production effects are enabled:

**Prices**

The roadmap proposes $4.99/month and $39.99/year.

**Pro capability split**

The documented Free/Pro allocation is the intended starting point.

**Trial**

Fourteen days without a card.

**BLIZZY**

Fifty percent off the first three months of a monthly subscription, capped at 200 redemptions.

**Grace period**

Seven days is the guide's proposed configurable default.

**Tax treatment**

The owner must establish applicable registration and tax-handling decisions.

The implementation may prepare and test configurable values but must not silently treat unresolved production choices as authorization for live billing.

### Decisions delegated to the spec

The downstream process must determine:

* Exact capability names and mapping to existing features.
* How entitlement sources combine and expire.
* How trial dates are evaluated.
* The approved account-state treatment for overlapping subscription, trial, and comp sources.
* Precise billing lifecycle handling.
* Verified webhook event interpretation and idempotency.
* Stripe test-mode promotion semantics.
* Exact grace-period behavior.
* Admin grant and revocation interactions.
* The complete Free treatment of existing Pro surfaces.
* Appropriate checkout-return and Customer Portal states.
* Verification coverage for all protected paths.

These are specification responsibilities rather than pitch-level implementation decisions.

### Required upstream amendment — delayed iOS development

The supplied roadmap still places iOS Foundation before billing.

The owner has chosen to postpone it.

The revised dependency must identify Public Accounts and Admin Center as immediate prerequisites while leaving native app work for a later, complete mobile phase.

No partial iOS work is authorized.

### Required upstream amendment — pitch numbering

The supplied roadmap calls this Pitch 20.

The proposed revised sequence calls it Pitch 19.

Final artifact paths and identifiers must match the authoritative roadmap, and no implementation agent should silently renumber unrelated features.

### Required upstream amendment — launch readiness

The original launch-readiness requirements include native iPhone verification.

With native iOS postponed, the commercial web launch must instead verify desktop and mobile-browser journeys.

The later native release retains its separate device and store verification obligations.

This amendment does not permit skipping payment, authentication, or account-isolation testing.

---

## 15. Rollout and delivery boundary

### UI-bearing classification

The pitch introduces subscription management, trial and paid-plan states, upgrade messaging, promotional checkout behavior, and administrative entitlement interactions.

It therefore requires the established UI-bearing workflow:

**Pitch → Design Doc → UI Preview → Spec → Linear Tickets → Implementation**

The design and UI-preview skills own the presentation.

The spec owns implementation contracts and security behavior.

### Platform boundary

This is a web-first feature.

Desktop and mobile browsers must support the complete intended subscription journey.

No native app implementation is included.

### Merge behavior — stop before merge

The updated pipeline guide explicitly requires stopping before merge for work involving money, plans, entitlements, and account capabilities.

Even when code review and verification are green, the completed feature PR must remain open for human approval.

### Production boundary

The autonomous run must not:

* Apply production migrations.
* Activate Stripe live mode.
* Process real charges.
* Alter production billing credentials.
* Enable public signup.
* Release an app to an app store.
* Modify real production entitlements without authorization.

The runbook must identify the owner's required human steps.

### Paid-launch gate

Overload must not collect real payments until Launch Readiness & Closed Beta has passed and the owner has approved the launch.

Implementing the billing system is a prerequisite, not the launch authorization itself.

---

## 16. Handoff to design and spec

The following product outcomes are fixed:

 1. Overload offers Free and Pro.
 2. Free includes complete training capture, logging, basic history, goals, export, and account management.
 3. Pro includes the documented progression intelligence and advanced exercise-history capabilities.
 4. No ads are introduced.
 5. Access is enforced through named capabilities on the server.
 6. A Free account cannot receive a Pro-only result through direct invocation.
 7. New accounts receive a 14-day card-free Pro trial.
 8. Trial expiration without another entitlement returns the account to Free.
 9. Downgrading never deletes or modifies training records.
10. Monthly and annual subscriptions use Stripe-hosted Checkout.
11. Customers manage subscriptions through the Customer Portal.
12. Verified billing events are authoritative for paid subscription state.
13. Repeated webhook delivery does not change the outcome.
14. Overlapping trial, subscription, and complimentary sources resolve consistently.
15. Founding members receive complimentary Pro access through the approved mechanism.
16. The owner can grant and revoke complimentary access with a reason, optional expiration, and audit entry.
17. Complimentary access never becomes an administrative role or a Stripe subscription.
18. BLIZZY provides the documented introductory monthly discount with its redemption cap.
19. Promotional duration and regular renewal price are clearly disclosed.
20. Failed payments follow the approved grace-period policy.
21. The admin center can show permitted subscription and redemption information without exposing private training content.
22. Payment-card information never enters Overload.
23. The feature is complete for desktop and mobile browsers.
24. Native iOS development remains postponed.
25. The final User Guidance ticket maintains the existing onboarding and What's New mechanisms.
26. The feature PR stops before merge for human approval.
27. Real payment collection remains prohibited until the separate launch-readiness approval.

The design stage determines how the user understands and navigates plans, trial status, upgrades, subscription management, and relevant administrative controls.

The spec stage determines the entitlement, billing, security, lifecycle, validation, and verification contracts.

Neither stage may weaken account isolation, withhold user-owned training data, create a second billing authority, or introduce native app work merely because the original roadmap expected iOS to come first.

**Completion outcome:** Overload has a complete Free and Pro commercial system that lets users try, purchase, manage, and receive appropriate product capabilities while keeping their training data secure and accessible, with the entire implementation tested without collecting real payments.

**End of pitch.**
