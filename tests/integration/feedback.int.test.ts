import { submitFeedback } from "@/lib/feedback/feedback";
import { FEEDBACK_DAILY_LIMIT } from "@/lib/feedback/validation";
import { DomainError } from "@/lib/actions/result";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";

/**
 * Send feedback against a real database (Admin Center & Feedback, spec §11,
 * §14.2): the stored row, nothing attached, and the rolling 24-hour cap.
 */

it("stores the trimmed message, category, and owner as open, with nothing attached", async () => {
  const account = await createTestAccount();
  const { id } = await submitFeedback(account, {
    category: "question",
    message: "  How does Overload decide when a lift is ready to go up?  ",
  });
  const row = await getTestPrisma().feedback.findUniqueOrThrow({
    where: { id },
  });
  expect(row).toEqual({
    id,
    userId: account.userId,
    category: "question",
    message: "How does Overload decide when a lift is ready to go up?",
    handledAt: null,
    createdAt: expect.any(Date),
    updatedAt: expect.any(Date),
  });
});

it("refuses the message after the daily limit, and allows it again after 24 hours", async () => {
  const account = await createTestAccount();
  for (let i = 0; i < FEEDBACK_DAILY_LIMIT; i++) {
    await submitFeedback(account, { category: "other", message: `note ${i}` });
  }
  await expect(
    submitFeedback(account, { category: "other", message: "one too many" }),
  ).rejects.toEqual(new DomainError("conflict", "limit"));
  expect(await getTestPrisma().feedback.count()).toBe(FEEDBACK_DAILY_LIMIT);

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000 + 1000);
  await expect(
    submitFeedback(
      account,
      { category: "other", message: "next day" },
      tomorrow,
    ),
  ).resolves.toEqual({ id: expect.any(String) });
});

it("rejects invalid input without writing", async () => {
  const account = await createTestAccount();
  await expect(
    submitFeedback(account, { category: "bug", message: " " }),
  ).rejects.toMatchObject({ code: "validation_error" });
  expect(await getTestPrisma().feedback.count()).toBe(0);
});
