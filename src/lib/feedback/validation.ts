/**
 * Feedback input rules (Admin Center & Feedback, spec §10.3, §12; R5, R19,
 * R20). Pure and client-safe: the form shows the same limits the server
 * enforces, and the database CHECK backs the message rule.
 */

export const FEEDBACK_CATEGORIES = [
  "bug",
  "idea",
  "question",
  "other",
] as const;
export type FeedbackCategoryValue = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategoryValue, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  other: "Other",
};

/** Longest message, in characters, after trimming. */
export const FEEDBACK_MESSAGE_MAX = 2000;

/**
 * Most messages one account may send in any rolling 24 hours: a cheap guard
 * against a stuck button or a script, with no queue or cache (bucket C,
 * flagged for review in the run report).
 */
export const FEEDBACK_DAILY_LIMIT = 10;

export function isFeedbackCategory(
  value: unknown,
): value is FeedbackCategoryValue {
  return (
    typeof value === "string" &&
    (FEEDBACK_CATEGORIES as readonly string[]).includes(value)
  );
}

export type FeedbackInput = {
  category: FeedbackCategoryValue;
  message: string;
};

export type FeedbackFieldErrors = { category?: string; message?: string };

export function parseFeedbackInput(raw: {
  category: unknown;
  message: unknown;
}):
  | { ok: true; value: FeedbackInput }
  | { ok: false; errors: FeedbackFieldErrors } {
  const errors: FeedbackFieldErrors = {};
  if (!isFeedbackCategory(raw.category)) {
    errors.category = "Choose what it's about.";
  }
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (message.length === 0) {
    errors.message = "Write a message.";
  } else if (message.length > FEEDBACK_MESSAGE_MAX) {
    errors.message = "Keep it under 2,000 characters.";
  }
  if (errors.category || errors.message) return { ok: false, errors };
  return {
    ok: true,
    value: { category: raw.category as FeedbackCategoryValue, message },
  };
}
