import type { LegalDoc } from "./types";

/**
 * Terms of Service — REVIEWABLE DRAFT (spec §12; RD-12, RD-23). Built from
 * the owner's full draft (pitches/20-public-landing-page-changelog-appendix-c-
 * terms-draft.md) with the reviewer notes and brackets taken out of the copy:
 * every owner decision is a fact token, and every statement the code
 * contradicted was corrected (reconciliation table:
 * docs/runs/20-public-landing-page-changelog-runbook.md §Legal). Status
 * "draft": NOT approved, NOT in effect. Qualified legal review is advised before publication.
 */
export const TERMS_OF_SERVICE: LegalDoc = {
  kind: "terms",
  title: "Terms of service",
  status: "draft",
  approval: null,
  blocks: [
    { kind: "p", content: ["Effective ", { fact: "effectiveDate" }] },
    {
      kind: "p",
      content: [
        "These Terms govern your use of Overload, the strength-training web application at www.overloadtraining.app, operated by ",
        { fact: "operatorName" },
        " (“Overload,” “we,” or “us”). By creating an account or using Overload, you agree to these Terms and our Privacy Policy. If you do not agree, do not use the service. Questions go to ",
        { support: true },
        ".",
      ],
    },
    { kind: "h2", text: "What Overload does" },
    {
      kind: "p",
      content: [
        "Overload lets you plan workouts, log training, and keep your history, and, with Pro, see progression calls and trends computed from your logged performance and your plan. It is a tool for tracking and interpreting your training. It is not medical advice, not a substitute for a qualified coach, and not a guarantee of any strength, fitness, or injury-prevention result.",
      ],
    },
    {
      kind: "p",
      content: [
        "You are responsible for the exercises, loads, and training decisions you choose. Stop if something causes pain or you feel unwell, and get qualified advice when you need it.",
      ],
    },
    { kind: "h2", text: "Accounts and eligibility" },
    {
      kind: "p",
      content: [
        "You must be at least ",
        { fact: "minimumAge" },
        " years old to create an account. Give accurate account information, protect your password, and tell us if you think your account has been compromised. You are responsible for activity under your account to the extent the law allows. Don't access anyone else's account or interfere with Overload's security.",
      ],
    },
    {
      kind: "p",
      content: [
        "We may restrict or suspend an account when reasonably necessary to address abuse, security risks, misuse, or legal requirements, subject to applicable law.",
      ],
    },
    { kind: "h2", text: "Free, trial, and Pro" },
    {
      kind: "ul",
      items: [
        [
          "Free: workout planning and logging, your full history, goals, and data export stay available without paying. Overload has no ads.",
        ],
        [
          "Trial: new accounts get 14 days of Pro with no card. Overload runs the trial itself, so it never turns into a charge. When it ends, Pro features stop unless another Pro entitlement applies. Nothing you logged is deleted.",
        ],
        [
          "Pro: the progression calls and their reasons, trends, and exercise history intelligence, while you have an active trial, subscription, or complimentary access. The plan comparison on the pricing page lists what Pro includes now.",
        ],
        [
          "Complimentary access: we may grant or revoke complimentary Pro under the terms of the grant. It is not a subscription and never charges a card.",
        ],
      ],
    },
    { kind: "h2", text: "Paid subscriptions, when available" },
    {
      kind: "p",
      content: [
        "Pro subscriptions are not on sale yet. When they are, the price and billing interval will be shown before you buy. The intended US prices are $4.99 per month or $39.99 per year, before any applicable taxes or eligible discounts. The checkout total is final.",
      ],
    },
    {
      kind: "p",
      content: [
        "Stripe hosts checkout and the billing portal. A subscription renews automatically at its interval until you cancel. You can cancel from Plan & Billing in Settings, and Pro stays until the end of the period you paid for. If a renewal payment fails, Pro continues for a 7-day grace period before your account moves to Free. Stopping payment never deletes your workout history.",
      ],
    },
    {
      kind: "p",
      content: [
        "Refunds and cancellation: ",
        { fact: "refundPolicy" },
        " For a billing question, contact ",
        { support: true },
        ".",
      ],
    },
    { kind: "h2", text: "Promotional offers" },
    {
      kind: "p",
      content: [
        "Promotions can have eligibility rules, end dates, redemption limits, and plan restrictions. The BLIZZY offer, for example, is for first-time subscribers on the monthly plan: 50% off the first three monthly bills, up to 200 redemptions in total. A promotion page or a shared code does not guarantee eligibility or availability. Stripe checkout shows whether an offer applies and the resulting total.",
      ],
    },
    { kind: "h2", text: "Your information and content" },
    {
      kind: "p",
      content: [
        "Your logs, plans, and other content remain yours. You let Overload store, process, show you, and compute results from them as needed to run, secure, and improve the service under our Privacy Policy. Other lifters never see your content. You can export your data and delete your account from Settings.",
      ],
    },
    { kind: "h2", text: "Acceptable use" },
    {
      kind: "p",
      content: [
        "Don't try to bypass authentication, plan limits, payment restrictions, rate limits, or account boundaries, access another person's data, attack or unlawfully reverse engineer the service, distribute malware, automate abusive traffic, or interfere with other users. This does not prevent lawful security research or rights the law gives you that can't be limited by contract.",
      ],
    },
    { kind: "h2", text: "Availability and changes" },
    {
      kind: "p",
      content: [
        "Overload is a developing service. We may add, change, suspend, or remove features, and may need maintenance downtime. We will give the notice and remedies the law requires for material changes affecting paid users. We do not promise that any recommendation will improve your training.",
      ],
    },
    { kind: "h2", text: "Intellectual property" },
    {
      kind: "p",
      content: [
        "The Overload name, software, and design belong to their owners and licensors. These Terms give you a limited, personal, non-exclusive right to use the service, not ownership of it. Exercise images come from a public-domain dataset and remain under its terms.",
      ],
    },
    { kind: "h2", text: "Disclaimers, liability, and disputes" },
    {
      kind: "p",
      content: [
        "To the extent the law allows, Overload is provided without a promise of uninterrupted or error-free operation or of any training outcome. Nothing in these Terms limits rights that cannot legally be limited, including consumer protection rights. ",
        { fact: "governingLaw" },
      ],
    },
    { kind: "h2", text: "Ending your account" },
    {
      kind: "p",
      content: [
        "You can stop using Overload or delete your account from Settings at any time. Deleting your account does not cancel a paid subscription in Stripe. Cancel it from Plan & Billing first, or contact support. We may suspend or close an account for serious misuse, security issues, or legal reasons, subject to applicable law.",
      ],
    },
    { kind: "h2", text: "Changes to these Terms" },
    {
      kind: "p",
      content: [
        "We will post any update here with its effective date, and give notice or ask for consent when the law requires it.",
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
