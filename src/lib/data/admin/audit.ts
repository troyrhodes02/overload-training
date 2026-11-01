import "server-only";
import type { FeedbackCategory } from "@prisma/client";
import { isOpenAdminTx, type AdminTx } from "./db";
import { assertAdmin, type AdminActor } from "./identity";

/**
 * THE AUDIT WRITER (Admin Center & Feedback, spec R6, R11). Every admin
 * mutation records exactly one entry through here, inside the SAME
 * transaction as the change it records: if the entry cannot be written the
 * transaction rolls back and the change never happened, and a change that
 * turned out to be a no-op records nothing. The log is append-only — the
 * admin gate allows no update or delete and a database trigger rejects both.
 * Entries hold ids and an action, never names, emails, or messages.
 */
export type AuditEntryInput =
  | {
      action:
        "account_suspend" | "account_reactivate" | "account_reset_email_sent";
      targetUserId: string;
    }
  | {
      action: "feedback_handled" | "feedback_reopened";
      targetUserId: string;
      feedbackId: string;
    }
  | {
      action: "feedback_recategorized";
      targetUserId: string;
      feedbackId: string;
      detail: { from: FeedbackCategory; to: FeedbackCategory };
    };

export async function recordAudit(
  tx: AdminTx,
  actor: AdminActor,
  entry: AuditEntryInput,
): Promise<void> {
  // Structural: only a running inAdminTx() transaction is accepted. Passing
  // the top-level client would let the change and its entry commit apart.
  if (!isOpenAdminTx(tx)) {
    throw new Error(
      "recordAudit must run inside the transaction of the change it records.",
    );
  }
  assertAdmin(actor);
  await tx.adminAuditEntry.create({
    data: {
      actorUserId: actor.userId,
      kind: entry.action,
      targetUserId: entry.targetUserId,
      feedbackId: "feedbackId" in entry ? entry.feedbackId : null,
      ...("detail" in entry ? { detail: entry.detail } : {}),
    },
    select: { id: true },
  });
}
