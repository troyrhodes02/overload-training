import type { LegalDoc } from "./types";

/**
 * Privacy Policy — REVIEWABLE DRAFT (spec §12; RD-12). Built from the owner's
 * full draft (pitches/20-public-landing-page-changelog-appendix-b-privacy-
 * draft.md) with the reviewer notes and brackets taken out of the copy:
 * every owner decision is a fact token, and every statement the code
 * contradicted was corrected to what the code does (reconciliation table:
 * docs/runs/20-public-landing-page-changelog-runbook.md §Legal). Status
 * "draft": NOT approved, NOT in effect. Qualified legal review is advised before publication.
 */
export const PRIVACY_POLICY: LegalDoc = {
  kind: "privacy",
  title: "Privacy policy",
  status: "draft",
  approval: null,
  blocks: [
    { kind: "p", content: ["Effective ", { fact: "effectiveDate" }] },
    {
      kind: "p",
      content: [
        "Overload (“Overload,” “we,” “us,” or “our”) is a strength-training web application operated by ",
        { fact: "operatorName" },
        ", located at ",
        { fact: "contactAddress" },
        ". This policy explains what information we collect, why we use it, the services that help us run Overload, and the choices you have. For privacy questions, contact ",
        { support: true },
        ".",
      ],
    },
    { kind: "h2", text: "Information we collect" },
    {
      kind: "p",
      content: [
        "Account information. When you create an account we collect your first and last name, a username, your email address, and what our authentication provider needs to sign you in. Overload never sees or stores your password. We also keep account settings and facts such as your time zone, appearance preference, whether you have verified your email, your account status, and the last calendar day your account was used (a date, not a time).",
      ],
    },
    {
      kind: "p",
      content: [
        "Training information you enter: plans and mesocycles, sessions and exercises (including custom exercises), logged weights, sets, reps, and reps in reserve, goals, cardio records, and gym names with any location text you add. It belongs to your account. We use it to provide logging, history, and export and, when you have Pro, the progression calls and trends computed from it.",
      ],
    },
    {
      kind: "p",
      content: [
        "Plan and billing information. We record whether your account is on Free, a trial, complimentary Pro, or a subscription, with dates. When paid checkout is available, Stripe processes payments, and we keep a copy of the billing state Stripe reports to us: a customer reference, subscription status, renewal date, and any promotion code redeemed. We never ask for card details in Overload's own forms and never store card numbers.",
      ],
    },
    {
      kind: "p",
      content: [
        "Support and feedback. If you send feedback from the app, we store your message, its category, and any screenshots you attach, so the person who runs Overload can read and act on it. If you email support, we receive your message and address.",
      ],
    },
    {
      kind: "p",
      content: [
        "Technical and security information. Our hosting and authentication providers process technical information such as IP addresses, browser details, and request times to run the service. To limit automated signups and password-reset abuse, Overload stores a one-way hash of a request fingerprint (your IP address, or browser details when no IP is available) with a time window, and uses Cloudflare Turnstile to check for bots in those flows. Overload uses no analytics, advertising, or tracking tools.",
      ],
    },
    {
      kind: "p",
      content: [
        "Campaign source. If you open a campaign page such as /blizzy, a first-party cookie remembers that campaign in your browser for up to two hours. If you create an account in that time, we record the campaign name (for example, “blizzy”) on your account and delete the cookie. We record nothing else about the visit.",
      ],
    },
    { kind: "h2", text: "How we use information" },
    {
      kind: "p",
      content: [
        "We use information to create and protect accounts; to provide logging, history, export, settings, and plan-based features; to compute training calls and trends from your own records; to send account email such as verification and password reset; to manage trial, complimentary, or paid access; to respond to support and feedback; to prevent abuse; to investigate errors; and to meet legal obligations. We never use your training records as public examples. Our marketing screenshots come from a synthetic demo account.",
      ],
    },
    { kind: "h2", text: "When information is shared" },
    {
      kind: "p",
      content: [
        "We use service providers to run Overload. Each processes only what its job needs, under its own terms:",
      ],
    },
    {
      kind: "ul",
      items: [
        [
          "Supabase: authentication, the database, and file storage for exercise images and feedback screenshots.",
        ],
        ["Vercel: hosting and the website's server functions."],
        [
          "Resend: delivery of account email (verification and password reset) sent by our authentication provider.",
        ],
        ["ImprovMX: routing of messages sent to our support address."],
        ["Cloudflare Turnstile: bot checks on signup and password reset."],
        [
          "Stripe: checkout, subscriptions, and the billing portal, once paid plans are on sale.",
        ],
      ],
    },
    {
      kind: "p",
      content: [
        "We may also disclose information when the law requires it, to protect people or the service, or in a business transfer where the law allows. Other lifters never see your training data. No account can see another's.",
      ],
    },
    { kind: "h2", text: "Cookies and similar technologies" },
    {
      kind: "p",
      content: [
        "Overload uses cookies to keep you signed in, and the first-party campaign cookie described above. Your browser also stores two conveniences on your device: your last appearance choice, so the first screen doesn't flash, and which upgrade notes you dismissed. Cloudflare Turnstile may use browser signals during a bot check. We use no advertising pixels or third-party tracking.",
      ],
    },
    { kind: "h2", text: "How long we keep information" },
    {
      kind: "p",
      content: [
        "We keep your account and training records while your account exists, so your history stays available. You can export everything and delete your account from Settings at any time. Deleting your account removes your account's records from our database in one step. Copies kept by providers (logs, billing records at Stripe, backups) follow their retention schedules. ",
        { fact: "retentionStatement" },
      ],
    },
    { kind: "h2", text: "Your choices and rights" },
    {
      kind: "p",
      content: [
        "You can update your name, username, time zone, and appearance in Settings, export all of your data, and delete your account. For access, correction, deletion, or other privacy requests, contact ",
        { support: true },
        ". Depending on where you live, you may have additional rights, and we will respond as the law requires after verifying the request.",
      ],
    },
    { kind: "h2", text: "Security" },
    {
      kind: "p",
      content: [
        "Every account's data is scoped to that account, and our providers' infrastructure protects it in transit and at rest. No online service can guarantee absolute security. Use a strong password, and tell us if you suspect someone else has used your account.",
      ],
    },
    { kind: "h2", text: "Children" },
    {
      kind: "p",
      content: [
        "Overload is not designed for children, and we do not knowingly collect information from children under 13. Accounts are for people at least ",
        { fact: "minimumAge" },
        " years old. If you believe a child has given us information, contact support.",
      ],
    },
    { kind: "h2", text: "International use" },
    {
      kind: "p",
      content: [
        "Overload and its providers may process information in the United States and other countries where they operate. ",
        { fact: "regionalNotice" },
      ],
    },
    { kind: "h2", text: "Changes to this policy" },
    {
      kind: "p",
      content: [
        "We will post any update here with its effective date, and give additional notice when the law requires it.",
      ],
    },
    { kind: "h2", text: "Contact" },
    {
      kind: "p",
      content: [
        { fact: "operatorName" },
        " · ",
        { support: true },
        " · ",
        { fact: "contactAddress" },
      ],
    },
  ],
};
