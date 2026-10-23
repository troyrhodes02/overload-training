import "server-only";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import {
  FEEDBACK_DAILY_LIMIT,
  parseFeedbackInput,
  type FeedbackInput,
} from "./validation";

/**
 * Sending feedback (Admin Center & Feedback, spec §11; R5, R19, R20). The
 * acting account writes its own message through the account-scoped client,
 * which stamps the owner; nothing else is attached — no route, device, or
 * training context. Free on every plan: there is no capability check.
 *
 * Throws DomainError("validation_error", …, fieldErrors) for bad input and
 * DomainError("conflict", "limit") once the account has sent
 * FEEDBACK_DAILY_LIMIT messages in the last 24 hours.
 */
export async function submitFeedback(
  account: Account,
  raw: { category: unknown; message: unknown },
  now: Date = new Date(),
): Promise<{ id: string }> {
  const parsed = parseFeedbackInput(raw);
  if (!parsed.ok) {
    throw new DomainError(
      "validation_error",
      "Check the highlighted fields.",
      parsed.errors as Record<string, string>,
    );
  }
  const input: FeedbackInput = parsed.value;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await account.db.feedback.count({
    where: { createdAt: { gte: since } },
  });
  if (recent >= FEEDBACK_DAILY_LIMIT) {
    throw new DomainError("conflict", "limit");
  }
  return account.db.feedback.create({
    data: {
      userId: account.userId,
      category: input.category,
      message: input.message,
    },
    select: { id: true },
  });
}
