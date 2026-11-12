import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_DAILY_LIMIT,
  FEEDBACK_MESSAGE_MAX,
  isFeedbackCategory,
  parseFeedbackInput,
} from "@/lib/feedback/validation";

/** Feedback input rules (Admin Center & Feedback, spec §10.3, §12; R5, R19). */

it("the categories are exactly Bug, Idea, Question, Other (R5)", () => {
  expect([...FEEDBACK_CATEGORIES]).toEqual([
    "bug",
    "idea",
    "question",
    "other",
  ]);
  for (const v of ["Bug", "praise", "", null, undefined, 1, {}]) {
    expect([v, isFeedbackCategory(v)]).toEqual([v, false]);
  }
});

it("the limits are the spec's named constants", () => {
  expect(FEEDBACK_MESSAGE_MAX).toBe(2000);
  expect(FEEDBACK_DAILY_LIMIT).toBe(10);
});

it("trims the message and accepts 1 to 2000 characters", () => {
  expect(parseFeedbackInput({ category: "bug", message: "  x  " })).toEqual({
    ok: true,
    value: { category: "bug", message: "x" },
  });
  const max = "y".repeat(2000);
  expect(
    parseFeedbackInput({ category: "idea", message: ` ${max}\n` }),
  ).toEqual({
    ok: true,
    value: { category: "idea", message: max },
  });
});

it("names every problem at once, in the lifter's words", () => {
  expect(parseFeedbackInput({ category: undefined, message: "   " })).toEqual({
    ok: false,
    errors: {
      category: "Choose what it's about.",
      message: "Write a message.",
    },
  });
  expect(
    parseFeedbackInput({ category: "other", message: "z".repeat(2001) }),
  ).toEqual({
    ok: false,
    errors: { message: "Keep it under 2,000 characters." },
  });
  expect(parseFeedbackInput({ category: "bug", message: 42 })).toEqual({
    ok: false,
    errors: { message: "Write a message." },
  });
});
