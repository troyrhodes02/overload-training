import { PRICE_DISPLAY, TRIAL_DURATION_DAYS } from "@/lib/billing/config";

/**
 * The public pages' words (design doc §6; spec RD-14). Kept in one module so
 * the marketing-truth review runs over every public sentence: the banned-
 * phrase check and the shipped-capability check in tests read this file.
 * Everything here is a DRAFT for the owner's approval (spec OQ-2); each claim
 * maps to the real screen in the claim ledger (runbook).
 *
 * Rules: one concrete claim per section; no invented numbers, testimonials,
 * or ratings; no exclamation marks; Pro names only capabilities the code
 * gates today (progression_insights, e1rm_trends, exercise_history_
 * intelligence) — never plan import, which has not shipped.
 */

/**
 * How the trial works, said once and plainly (OVE-118, owner feedback on the
 * Workout Logging Refinements trial-wording chore). Every new account starts
 * on Pro for TRIAL_DURATION_DAYS automatically, with no card; the lifter may
 * subscribe during the trial; at the end they either subscribe or the account
 * moves to Free on its own. Copy only: no billing, trial, or entitlement
 * behavior depends on these strings, and the numbers come from the billing
 * display constants.
 *
 * Anything that offers a way to pay has a `billingOff` wording, used while
 * Pro subscriptions are not on sale (the public pages never promise a
 * purchase that can't be made).
 */
export const TRIAL = {
  title: `Every new account starts with ${TRIAL_DURATION_DAYS} days of Pro, free`,
  intro:
    "It starts on its own when you sign up. There's no credit card to enter and nothing to cancel.",
  steps: [
    {
      title: `Days 1 to ${TRIAL_DURATION_DAYS}: Pro, free`,
      body: "Every Pro feature is on from your first workout: the calls, the reasons behind them, and the trends.",
    },
    {
      title: "Upgrade any time",
      body: `Like it already? Subscribe to Pro during the trial, for ${PRICE_DISPLAY.monthly} a month or ${PRICE_DISPLAY.annual} a year.`,
      billingOff:
        "Pro subscriptions aren't on sale yet. When they are, you can subscribe during the trial or after it.",
    },
    {
      title: `Day ${TRIAL_DURATION_DAYS}: your call`,
      body: "Subscribe to keep Pro, or do nothing and your account moves to Free on its own. Nothing you logged is deleted.",
      billingOff:
        "Your account moves to Free on its own. Nothing you logged is deleted.",
    },
  ],
} as const;

/** The short trial note under the landing page's call to action. */
export const TRIAL_NOTE_TEXT = `Every new account gets ${TRIAL_DURATION_DAYS} days of Pro, free. No credit card needed.`;

export const HERO = {
  title: "You logged the reps. Know what to do next.",
  body: "Overload reads each set you log against the plan you wrote, then makes the call for every lift: go up, hold, or back off.",
  caption:
    "Example data. Today's plan: bench is ready to go up, and the held lifts carry no tag.",
} as const;

/**
 * The product showcase that follows the hero. The hero was simplified to one
 * photograph and a single compact call, so the dense Today dashboard capture
 * moves here, where it gets room of its own (design: hero composition
 * redesign). The caption reuses HERO.caption — it already describes exactly
 * this screen. One concrete, product-backed claim; no numbers, no superlatives.
 */
export const DAY_SHOWCASE = {
  eyebrow: "The day",
  title: "Open the app, and the day is already laid out.",
} as const;

/**
 * The landing's "Today" panel — a rendered Overload-UI mock, not a screenshot,
 * so no name is ever baked into an image. Change `name` here (or set it to ""
 * for no name) and the greeting updates everywhere it shows. Demo data only:
 * bench is ready to go up, the other planned lifts carry no tag.
 */
export const DAY_PANEL = {
  greeting: "Good evening",
  name: "Marcus",
  context: "Push · Week 7",
  lifts: [
    { name: "Barbell Bench Press", scheme: "3 × 6–8", progress: true },
    { name: "Incline Dumbbell Press", scheme: "3 × 8–10", progress: false },
    { name: "Lat Pulldown", scheme: "3 × 10–12", progress: false },
  ],
} as const;

export type LandingSection = {
  id: string;
  title: string;
  pro: boolean;
  paragraphs: readonly string[];
};

export const LANDING_SECTIONS = {
  log: {
    id: "log",
    title: "A log tells you what you did.",
    pro: false,
    paragraphs: [
      "Every set is kept and editable, and it shows up next time: the weight, the reps, at the gym you're in. Nothing gets overwritten.",
    ],
  },
  call: {
    id: "call",
    title: "The call, and the reason.",
    pro: true,
    paragraphs: [
      "“Ready to go up” comes with the weight to try and the sets that earned it. A hold says what's left to earn. A deload says where the sets fell short.",
      "Overload never changes your plan or your weights for you.",
    ],
  },
  gyms: {
    id: "gyms",
    title: "Machines aren't universal.",
    pro: false,
    paragraphs: [
      "The same machine takes a different load from one place to the next, so machine and cable weights are tracked per gym. Barbells and dumbbells stay the same everywhere.",
    ],
  },
  trend: {
    id: "trend",
    title: "A trend, not a list.",
    pro: true,
    paragraphs: [
      "Estimated 1-rep max over the weeks, so a stall shows up as a flat line instead of a feeling.",
    ],
  },
  plans: {
    id: "plans",
    title: "Logging is free. The call is Pro.",
    pro: false,
    paragraphs: [],
  },
  wont: {
    id: "wont",
    title: "What Overload won't do.",
    pro: false,
    paragraphs: [
      "It won't write your program, coach you, show your training to anyone, or run ads. You build the plan. Overload keeps the record and makes the load call inside it.",
    ],
  },
} as const satisfies Record<string, LandingSection>;

/**
 * The closing call to action (design doc Screen 1, final section — replaces
 * the former "Recently shipped" strip). The wording is availability-neutral:
 * the actual button and its note come from the server-resolved ModeCta, which
 * is the only place that says whether anyone can join, so this copy never
 * claims the product is open. It restates the promise in one line.
 */
export const FINAL_CTA = {
  eyebrow: "Get started",
  title: "Log the work. Get the call.",
  body: "Overload keeps every set you log and, on Pro, tells you whether to progress, hold, or deload — on the plan you wrote, at the gym you're in.",
} as const;

/**
 * The immersive photo bands (full-bleed art-directed sections, like "What
 * Overload won't do"). Short, quiet lines that let the photography lead; each
 * stays accurate to what the product does and sets up the section after it.
 */
export const IMMERSIVE_BANDS = {
  work: {
    slot: "effortBand",
    eyebrow: "The work",
    title: "You did the work.",
    body: "Overload handles the rest — keeping the record straight and telling you where each lift stands.",
  },
  longRun: {
    slot: "floorBand",
    eyebrow: "Day after day",
    title: "Built for the long run.",
    body: "Mesocycle after mesocycle, your history stays intact and keeps earning its place.",
  },
} as const;

export const PLANS_SUMMARY = {
  free: "Plans, logging, history, goals, export. No ads.",
  pro: "The calls and their reasons, e1RM trends and stall detection, rep records and past calls.",
} as const;

export const SCREEN_CAPTIONS = {
  logging: "The last session sits on the card while you log the next one.",
  exercise: "The weight to try, and the sets that earned it.",
  trend: "Estimated 1-rep max by session. Deload weeks are marked, not hidden.",
} as const;

/** Pricing (design doc Screen 2). Prices come from the display constants. */
export const PRICING = {
  title: "Free to log. Pro to decide.",
  intro: "Everything you enter stays yours on either plan.",
  monthly: PRICE_DISPLAY.monthly,
  annual: PRICE_DISPLAY.annual,
  /** $39.99 / 12, shown as "about". */
  annualPerMonth: "$3.33",
  /** Workout Logging Refinements RD-10: the approved trial sentence, verbatim. */
  /** Under the Free card's price: where an account lands after the trial. */
  freeCardNote:
    "Free forever. Your account moves here when the trial ends, unless you've subscribed.",
  freeCardNoteBillingOff:
    "Free forever. Your account moves here when the trial ends.",
  /** Under the Pro card's price. */
  proCardNote: `Free for your first ${TRIAL_DURATION_DAYS} days.`,
  notOnSale:
    "Pro subscriptions aren't on sale yet. These are the prices when they are.",
} as const;

export const FREE_FEATURES = [
  "Plans, mesocycles, and sessions",
  "Guided logging, with RIR and bodyweight sets",
  "Full history, editable",
  "Goals and their progress",
  "Gyms, with machine weights per gym",
  "Cardio log",
  "Export and account deletion",
  "No ads, ever",
] as const;

export const PRO_FEATURES = [
  "Everything in Free",
  "Progress, hold, and deload calls, with the weight to try and the reason",
  "e1RM trend and stall detection",
  "Rep records and the call each past session led to",
] as const;

/**
 * The pricing questions (OVE-118). `aBillingOff`, when present, replaces the
 * answer while Pro subscriptions are not on sale.
 */
export const PRICING_FAQ: readonly {
  q: string;
  a: string;
  aBillingOff?: string;
}[] = [
  {
    q: "How does the free trial work?",
    a: `Every new account gets Pro for ${TRIAL_DURATION_DAYS} days, starting automatically when you sign up. You don't enter a credit card, and there's nothing to cancel.`,
  },
  {
    q: "Can I upgrade before the trial ends?",
    a: "Yes. Subscribe from Plan & Billing whenever you like. Paid billing starts that day, and the rest of the free trial isn't added on.",
    aBillingOff:
      "Not yet: Pro subscriptions aren't on sale. When they are, you'll be able to subscribe during the trial or after it.",
  },
  {
    q: "What happens when the trial ends?",
    a: "If you haven't subscribed, your account moves to Free on its own. Your plans, history, goals, and export stay. The calls and trends are Pro.",
  },
  {
    q: "What if I stop paying?",
    a: "Your account moves to Free. Nothing you logged is deleted, and logging never stops.",
  },
  {
    q: "Can I take my data with me?",
    a: "Yes. Export everything from Settings, any time, on either plan.",
  },
];

/** Phrases the public pages must never use (design doc §6 review check). */
export const BANNED_PHRASES = [
  "unlock your potential",
  "revolutioniz",
  "train smarter",
  "game-changing",
  "game changing",
  "supercharge",
  "unleash",
  "the ultimate",
  "crush your goals",
  "powerful analytics",
  "at your fingertips",
  "ai-powered",
  "ai-driven",
  "ai coach",
  "seamless",
  "next-level",
  "transform your",
  "join thousands",
  "lifters trust",
  "plan import",
] as const;
