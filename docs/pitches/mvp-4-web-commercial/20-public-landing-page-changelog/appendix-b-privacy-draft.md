# Pitch 21 — Appendix B: Full draft Privacy Policy (owner fact-check required)

> Owner-supplied companion input for `docs/pitches/mvp-4-web-commercial/20-public-landing-page-changelog/pitch.md`, reproduced verbatim from the one-shot run prompt (2026-11-04). This is a **working draft for owner review, not owner-approved final legal language**. The reviewable page copy derived from it lives in `src/lib/legal/privacy.ts`; the code-versus-draft reconciliation lives in `docs/pitches/mvp-4-web-commercial/20-public-landing-page-changelog/runbook.md` §Legal.

# Overload — Privacy Policy

> **Publication status: OWNER REVIEW REQUIRED.** This is a full working draft based on Overload's product brief, architecture, and confirmed operating setup as of November 4, 2026—not a verified statement of every deployed data flow and not legal advice. **Do not publish** until the owner fills the bracketed details and a code/vendor review confirms the factual claims. Where a practice is conditional on an unlaunched feature, the draft says so.

**Effective date:** [DATE THE POLICY IS PUBLISHED]

Overload ("Overload," "we," "us," or "our") is a strength-training web application operated by **[LEGAL NAME OF OWNER OR BUSINESS]**, located at **[BUSINESS CONTACT ADDRESS OR OTHER LEGALLY SUFFICIENT CONTACT ADDRESS]**. We built Overload to help lifters keep a record of their training and understand their progress. This Privacy Policy explains what information we collect, why we use it, the services that help us operate Overload, and the choices available to you.

For privacy questions, contact **support@overloadtraining.app**.

## Information we collect

**Account information.** When you create an account, we collect your name, email address, and authentication information needed to sign you in. Our authentication provider manages passwords and authentication tokens; Overload does not need your plain-text password. We also maintain account settings such as your time zone, display preferences, verification status, and account status.

**Training information you choose to enter.** This can include your training plans and mesocycles; workout schedules and exercises; logged weights, sets, reps, and other performance records; goals; cardio records; gym names and optional locations; and notes or preferences supported by the app. Your training history is associated with your account. We use this information to provide your logging, history, export, and—when you have Pro access—progression analysis and related features.

**Subscription and entitlement information.** We maintain whether your account is Free, on an eligible trial, has complimentary Pro access, or has a subscription, together with relevant billing status, subscription identifiers, dates, and promotional-code information. When paid checkout is available, payments are processed by Stripe. We do not ask you to enter card details into Overload's own forms, and we do not store complete payment-card numbers.

**Support and feedback.** If you contact support or submit feedback, we receive the contents of your message and the contact information you provide so we can respond and investigate your request.

**Technical and security information.** When you use the website, our hosting, authentication, and abuse-prevention services may process technical information such as your IP address, browser or device information, timestamps, request details, and security signals. We use appropriate logs and safeguards to operate the service, prevent abuse, and troubleshoot issues. [OWNER/ENGINEERING: VERIFY ACTUAL LOGGING, ANALYTICS, AND RETENTION CONFIGURATION.]

**Campaign source, if you use a campaign link.** Overload may use a short-lived, first-party value to remember that you arrived from a particular campaign, such as the `/blizzy` page, and associate a limited campaign identifier with signup. We do not need your complete browsing history for this. [OWNER/ENGINEERING: CONFIRM THE FINAL ATTRIBUTION DESIGN AND RETENTION BEFORE PUBLISHING THIS PARAGRAPH.]

## How we use information

We use information to create and protect accounts; provide the workout log, history, exports, settings, and plan-based features; calculate training trends and recommendations from your own records; process account verification and password recovery; manage trial, complimentary, or paid access; respond to support requests; protect the service against abuse; investigate errors; and meet legal obligations.

Overload's progression guidance is based on the data you log. We do not use your private training records as public marketing examples without your specific permission. Our planned marketing screenshots and demos use synthetic data.

## When information is shared

We use service providers to operate Overload. Depending on the part of the service you use, these include:

- **Supabase** for authentication and the hosted PostgreSQL database, and for exercise-image storage.
- **Vercel** to host and deliver the website and its server functions.
- **Resend** and related email infrastructure to send account-related emails, and **ImprovMX** to route messages sent to our support address.
- **Cloudflare Turnstile** to help detect automated abuse in certain account flows.
- **Stripe**, when paid billing is enabled, for hosted checkout, subscriptions, and the customer billing portal.

These services may process information necessary to perform their functions, subject to their own service terms and privacy practices. We may also disclose information when required by law, to protect people or the service, or in connection with a business transfer as allowed by law. We do not make other users' training history accessible through the app.

[OWNER/ENGINEERING: RECONCILE THIS VENDOR LIST WITH ACTUAL DNS, EMAIL, SECURITY, MONITORING, ANALYTICS, AND ANY FUTURE EMBEDDED DEMO PROVIDER. If an external interactive demo is embedded or linked and collects usage data, add its disclosure before enabling it.]

## Cookies and similar technologies

Overload uses cookies or comparable browser storage to maintain sign-in sessions and make the website function. Security tools may also use browser-based signals to detect abuse. If first-party campaign attribution is enabled, a limited, short-lived value may remember an allowed campaign during your visit. [OWNER/ENGINEERING: VERIFY THE EXACT COOKIES, STORAGE DURATION, AND ANY CONSENT REQUIREMENTS.]

We do not plan to add advertising pixels or third-party behavioral profiling as part of the public landing page. If this practice changes, we will update this policy and provide any notices or choices required by law.

## How long we keep information

We generally keep your account and training records while your account remains active so your logging history and progress remain available. You can request an account export and delete your account using the available account controls. Deletion is intended to remove account-owned application records, subject to information we must retain for legal, security, accounting, dispute, or operational reasons. Copies in provider logs, billing records, or backups may be retained according to applicable obligations and configured retention schedules.

**[OWNER/ENGINEERING ACTION REQUIRED: specify verified log/support/billing/backup retention periods or a more precise, truthful description before publishing. Do not claim immediate deletion of all copies.]**

## Your choices and rights

You can review and update supported account settings, export your account data, and request account deletion through Overload's account controls. You can contact **support@overloadtraining.app** for assistance with access, correction, deletion, or other privacy requests. Depending on where you live, privacy laws may provide additional rights, such as rights to access, correct, delete, or obtain a copy of personal information or to appeal a decision. We will respond as required by applicable law after verifying the request where appropriate.

## Security

We use account authentication, account-scoped access controls, and service-provider infrastructure intended to protect your information. No online service can guarantee absolute security. Please use a strong password and notify us if you suspect unauthorized access to your account.

## Children

Overload is not designed for children under 13, and we do not knowingly seek to collect personal information from children under 13. **[OWNER: decide the account minimum age and align signup validation, Terms, and this statement with applicable law before publishing.]** If you believe a child has provided personal information, contact support.

## International use

Overload and our service providers may process information in the United States and other locations in which they operate. If you use the service from elsewhere, your information may be processed across borders, subject to applicable law. **[OWNER/LEGAL: verify required regional transfer notices and rights before launching in additional regions.]**

## Changes to this policy

We may update this policy as the service changes. We will post the updated version here with its effective date, and provide additional notice when required by law.

## Contact

**[LEGAL NAME OF OWNER OR BUSINESS]**
**support@overloadtraining.app**
**[BUSINESS CONTACT ADDRESS OR OTHER LEGALLY SUFFICIENT CONTACT ADDRESS]**

---

## Owner verification before publication (remove this section from the published page)

1. Identify the actual legal operator and appropriate contact address; choose publication date.
2. Inspect deployed code and vendor settings for cookies, IP/logs, security tooling, and support retention.
3. Verify all processors, where data is stored, and whether any demo platform is embedded. Avoid third-party demo analytics until disclosed and approved.
4. Verify deletion/export behavior, backup and billing record retention, and whether a user's support messages are deleted independently.
5. Confirm regional privacy laws, age requirements, and health-related data obligations; fitness/training information may be sensitive in some jurisdictions.
6. Review whether the exact campaign attribution design changes the notice.
7. Review with qualified counsel before broad public launch; do not claim that legal review has occurred.

**Useful sources for that review:**
- FTC, [Mobile Health App Developers: Best Practices](https://www.ftc.gov/business-guidance/resources/mobile-health-app-developers-ftc-best-practices)
- FTC, [Health privacy guidance](https://www.ftc.gov/business-guidance/privacy-security/health-privacy)
- FTC, [Health Breach Notification Rule—who is covered](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0)
