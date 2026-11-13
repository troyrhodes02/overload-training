import "server-only";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import {
  FEEDBACK_DAILY_LIMIT,
  parseFeedbackInput,
  type FeedbackInput,
} from "@overload/shared/feedback/validation";

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
/**
 * Pre-flight for a submission (OVE-126 / audit F-A8): validate the input and
 * check the daily limit BEFORE any screenshot is uploaded, so a rejected
 * submission puts nothing in Storage. Throws exactly what submitFeedback would
 * (validation_error / conflict "limit"). submitFeedback re-checks the limit
 * inside its serializable transaction, so this never weakens the race guard.
 */
export async function assertFeedbackAllowed(
  account: Account,
  raw: { category: unknown; message: unknown },
  now: Date = new Date(),
): Promise<void> {
  const parsed = parseFeedbackInput(raw);
  if (!parsed.ok) {
    throw new DomainError(
      "validation_error",
      "Check the highlighted fields.",
      parsed.errors as Record<string, string>,
    );
  }
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await account.db.feedback.count({
    where: { createdAt: { gte: since } },
  });
  if (recent >= FEEDBACK_DAILY_LIMIT) {
    throw new DomainError("conflict", "limit");
  }
}

export async function submitFeedback(
  account: Account,
  raw: {
    category: unknown;
    message: unknown;
    /**
     * Already-uploaded screenshots to attach, in display order. The caller
     * uploads the bytes to Storage first and passes their object paths here, so
     * the rows and the message are written together (one atomic submission).
     */
    attachments?: {
      objectPath: string;
      contentType: string;
      sizeBytes: number;
    }[];
  },
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
  const attachments = raw.attachments ?? [];
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  // The count and the insert run in one SERIALIZABLE transaction, so a burst
  // of parallel submissions (a stuck button, a script) can't all pass the cap
  // by counting before any of them commits: Postgres aborts the racers with a
  // serialization failure, which the action reports as "couldn't send".
  return account.db.$transaction(
    async (tx) => {
      const recent = await tx.feedback.count({
        where: { createdAt: { gte: since } },
      });
      if (recent >= FEEDBACK_DAILY_LIMIT) {
        throw new DomainError("conflict", "limit");
      }
      const created = await tx.feedback.create({
        data: {
          userId: account.userId,
          category: input.category,
          message: input.message,
        },
        select: { id: true },
      });
      if (attachments.length > 0) {
        // Rows are stamped with the acting owner, exactly like the message.
        await tx.feedbackAttachment.createMany({
          data: attachments.map((a, i) => ({
            userId: account.userId,
            feedbackId: created.id,
            objectPath: a.objectPath,
            contentType: a.contentType,
            sizeBytes: a.sizeBytes,
            position: i,
          })),
        });
      }
      return created;
    },
    { isolationLevel: "Serializable" },
  );
}
