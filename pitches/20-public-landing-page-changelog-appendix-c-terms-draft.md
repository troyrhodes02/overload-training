# Pitch 21 — Appendix C: Full draft Terms of Service (owner fact-check required)

> Owner-supplied companion input for `pitches/20-public-landing-page-changelog.md`, reproduced verbatim from the one-shot run prompt (2026-11-04). This is a **working draft for owner review, not owner-approved final legal language**. The reviewable page copy derived from it lives in `src/lib/legal/terms.ts`; the code-versus-draft reconciliation lives in `docs/runs/20-public-landing-page-changelog-runbook.md` §Legal.

# Overload — Terms of Service

> **Publication status: OWNER REVIEW REQUIRED.** Complete working draft based on Overload's planned and deployed web service, not a legal opinion or approved contract. Fill factual/legal choices and verify checkout behavior before publication. Bracketed items are deliberate owner decisions; this document must not ship with brackets or this reviewer note.

**Effective date:** [DATE THE TERMS ARE PUBLISHED]

These Terms of Service ("Terms") govern your use of Overload, the strength-training web application available at **www.overloadtraining.app**, operated by **[LEGAL NAME OF OWNER OR BUSINESS]** ("Overload," "we," or "us"). By creating an account or using Overload, you agree to these Terms and our [Privacy Policy](/privacy).

If you do not agree, do not use the service. Questions can be sent to **support@overloadtraining.app**.

## What Overload does

Overload lets you organize workouts, log training, keep workout history, and—when eligible for Pro—view additional progression information derived from your logged performance and plans. Overload is a tool for tracking and interpreting training information. It is not a medical service, personalized medical advice, a substitute for a qualified coach, or a guarantee of strength, fitness, or injury-prevention results.

You remain responsible for choosing exercises, loads, and training decisions appropriate for your circumstances. Stop an activity if it causes pain or you feel unwell, and seek qualified professional advice when needed.

## Accounts and eligibility

You must provide accurate account information, protect your login credentials, and notify us if you suspect your account has been compromised. You are responsible for activity under your account to the extent permitted by law. You may not access another person's account without authorization or interfere with the security of Overload.

**[OWNER DECISION: minimum age for account holders, for example 18. Confirm how signup enforces the chosen age requirement before publishing.]**

We may restrict or suspend access when reasonably necessary to address abuse, security risks, misuse, or legal requirements, subject to applicable law.

## Free, trial, and Pro features

**Free:** Workout capture, your own workout history, and supported data export remain available without a paid Pro subscription. Overload is designed without advertising.

**Trial:** Eligible new accounts receive a **14-day, card-free Pro trial**. The trial is managed by Overload, not by an automatically charging Stripe trial. At its end, Pro features become unavailable unless another valid Pro entitlement applies. Your logged workout records are not deleted just because a trial ends.

**Pro:** Additional progression recommendations, trends, and interpretation features depend on an active trial, subscription, or complimentary entitlement. The specific features offered may change as the product develops; the current plan comparison explains what is available.

**Complimentary access:** Overload may grant or revoke promotional or complimentary Pro access under the stated terms of the grant. A complimentary grant is not a paid subscription and does not itself charge a card.

## Paid subscriptions, when available

At the time these Terms are drafted, **live subscription purchases are not yet available**. When live checkout is enabled, subscription prices and billing intervals will be displayed before purchase. The currently intended US prices are **$4.99 per month** or **$39.99 per year**, before any applicable taxes or eligible discounts; the final checkout is authoritative.

If you purchase a paid plan, Stripe hosts the checkout and billing portal. A paid subscription renews automatically at the chosen interval until canceled, unless the checkout terms say otherwise. You can manage or schedule cancellation using the billing portal linked from your Overload account. If you cancel effective at the end of a paid period, Pro access generally remains until the displayed end date. If a renewal payment fails, access may continue during an applicable grace period before moving to Free.

Canceling Pro never removes your account's own workout history merely because you stop paying. You will not be automatically charged simply because your free, card-free trial ends.

**[OWNER/LEGAL ACTION: confirm whether introductory pricing, taxes, billing date changes, refunds, chargebacks, and required renewal notices need additional text for launch regions. Do not assert a blanket no-refunds rule without owner approval and legal review.]**

For a billing issue or refund request, contact **support@overloadtraining.app**. We will handle requests under applicable law and any refund terms presented when the purchase was made.

## Promotional offers

Promotions may have eligibility rules, expiration dates, redemption limits, plan restrictions, or limits on combining offers. For example, the planned **BLIZZY** offer is intended for eligible first-time customers on the monthly plan and offers 50% off the first three monthly billing cycles, subject to a maximum of 200 redemptions. A promotional page or shared code does not guarantee eligibility or availability. Valid offers and the resulting total will be displayed in the actual Stripe checkout when purchases are enabled.

## Your information and content

Your workout logs, plans, and other account content remain yours. You give Overload permission to store, process, display to you, and compute results from that content as needed to provide, secure, and improve the service in accordance with our Privacy Policy. You must have the right to submit any content you enter.

We will not expose your private account content to other lifters as part of the product. You can export supported account data and request account deletion through available account controls, subject to the Privacy Policy and applicable recordkeeping obligations.

## Acceptable use

You agree not to try to bypass authentication, entitlements, payment restrictions, rate limits, or account boundaries; access another user's data; reverse engineer or attack the service in violation of law; distribute malware; automate abusive traffic; or use the service in a manner that interferes with other users. These restrictions do not prevent lawful security research or rights that cannot be limited by contract.

## Availability and changes

Overload is a developing service. We may add, improve, suspend, or discontinue features, and we may need maintenance or downtime. We will provide notices and remedies required by applicable law for material changes affecting paid users. We do not guarantee that a particular recommendation will improve training outcomes.

## Intellectual property

The Overload name, software, design, and original materials belong to their respective owners and licensors. These Terms give you a limited, personal, non-exclusive right to use the service in accordance with these Terms. They do not transfer ownership of the software or branding to you. Public-domain or third-party exercise imagery remains subject to its applicable terms.

## Disclaimers and liability

To the extent permitted by applicable law, Overload is offered without a promise of uninterrupted or error-free operation or a particular training outcome. Nothing in these Terms excludes or limits rights or responsibilities that cannot legally be excluded or limited, including applicable consumer protection rights.

**[LEGAL REVIEW REQUIRED: Add a jurisdiction-appropriate limitation of liability, dispute-resolution and governing-law provision, if appropriate, only after the owner makes those decisions. Do not invent an arbitration clause or legal jurisdiction.]**

## Ending your account

You may stop using the service or delete your account through available account settings. Account deletion and subscription cancellation are distinct actions; before deleting an account with an active paid subscription, use the billing portal or contact support to confirm billing has been canceled. **[ENGINEERING/OWNER: verify whether actual account-deletion code automatically cancels Stripe subscriptions and revise this section to match before paid launch.]** We may suspend or close accounts for serious misuse, security issues, or legal reasons, subject to applicable law.

## Changes to these Terms

We may update these Terms as the service evolves. Updated Terms will be posted with their effective date, and we will provide notice and obtain consent when required by applicable law.

## Contact

**[LEGAL NAME OF OWNER OR BUSINESS]**
**support@overloadtraining.app**
**[BUSINESS CONTACT ADDRESS OR OTHER LEGALLY SUFFICIENT CONTACT ADDRESS]**

---

## Owner verification before publication (remove this section from the published page)

1. Confirm legal operator identity, contact address, effective date, age requirement, and applicable jurisdiction.
2. Reconcile paid plan terms with live Stripe configuration, applicable taxes, billing portal behavior, and any consumer renewal disclosure requirements.
3. Decide refund and cancellation policy; verify account deletion automatically stops or does not stop billing.
4. Review liability, dispute resolution, warranty, and consumer-law wording with qualified counsel.
5. Ensure every marketed capability exists at launch; omit unshipped Plan Import and native iOS claims.
6. Confirm BLIZZY restrictions and any material creator/affiliate disclosures in marketing itself.
