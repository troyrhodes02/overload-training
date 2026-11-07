import {
  BLIZZY,
  PRICE_DISPLAY,
  TRIAL_DURATION_DAYS,
} from "@/lib/billing/config";

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
  trial: `New accounts get ${TRIAL_DURATION_DAYS} days of Pro, no card. After that you're on Free unless you subscribe, and nothing is deleted.`,
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

export const PRICING_FAQ = [
  {
    q: "What happens when the trial ends?",
    a: "You move to Free. Your plans, history, goals, and export stay. The calls and trends are Pro.",
  },
  {
    q: "What if I stop paying?",
    a: "Same as above. Nothing you logged is deleted, and logging never stops.",
  },
  {
    q: "Can I take my data with me?",
    a: "Yes. Export everything from Settings, any time, on either plan.",
  },
] as const;

/** The discount question: its tail depends on the billing switch. */
export const DISCOUNT_FAQ = {
  q: "Is there a discount code?",
  a: `${BLIZZY.code} gives 50% off the first three monthly bills for first-time subscribers, while redemptions last.`,
  offTail: "Subscriptions aren't on sale yet, so it can't be used today.",
} as const;

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

/** The BLIZZY page (design doc Screen 3; spec RD-7, RD-13). */
export const BLIZZY_PAGE = {
  eyebrow: "The BLIZZY offer",
  title: "50% off your first three months of Pro.",
  conditions: [
    `Monthly plan only (${PRICE_DISPLAY.monthly} / month).`,
    "50% off the first three monthly bills, then the regular price.",
    "First-time subscribers only.",
    `Up to ${BLIZZY.maxRedemptions} redemptions in total, so it can run out.`,
    "Entered at checkout. The total shown there is final.",
  ],
  availableOn: `Enter ${BLIZZY.code} at checkout on the monthly plan. Checkout shows whether it applies to you.`,
  availableOff:
    "Pro subscriptions aren't on sale yet, so the code can't be used today. When they are, you'll enter it at checkout on the monthly plan.",
  trialFit: `How it fits the trial: new accounts start with ${TRIAL_DURATION_DAYS} days of Pro, no card. The code is for when you subscribe after that.`,
  /**
   * Creator disclosure shown under the offer. States only what is known — that
   * this is a promotion offered through the creator — and asserts no
   * compensation fact. Plain marketing copy, not a legal document.
   */
  disclosureDraft:
    "This is a promotion for Overload offered through the creator BLIZZY.",
  aboutTitle: "What Overload is",
  about:
    "A workout log for lifters who write their own plan. It keeps every set and, on Pro, makes the call for each lift: go up, hold, or back off.",
} as const;
