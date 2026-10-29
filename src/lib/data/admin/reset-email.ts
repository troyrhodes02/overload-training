import "server-only";
import { DomainError, isUuid } from "@/lib/actions/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { inAdminTx } from "./db";
import { recordAudit } from "./audit";
import { readEmails, type EmailSource } from "./emails";
import { assertAdmin, type AdminActor } from "./identity";

/**
 * Admin "send reset email" (Public Accounts, spec §9, R8; design Screen 10).
 * The owner, helping an account they can see in the directory, triggers the
 * SAME password-recovery email the lifter would get from "Forgot password".
 *
 * It reuses the Pitch 17 admin mechanisms exactly: the fresh server-side admin
 * re-check (assertAdmin, the action awaits requireAdmin() before this runs),
 * the admin email facade for the target's address (read-only; emails live in
 * the sign-in system, not the database), and the audit writer inside one
 * inAdminTx() so the append-only entry and the action commit together — a send
 * that fails records nothing and reports "nothing was sent".
 *
 * It never reveals or changes the account's password: Supabase Auth sends the
 * standard recovery email through its own template, exactly as recovery.ts
 * does, and this module never touches a password. It never bypasses
 * suspension: Profile.status is not read or written, and a suspended account
 * that resets its password is still refused on its next request by
 * requireAccount(). And it exposes NO training content: the result is only
 * { sent, email }, and no plan/gym/set/goal/cardio is ever read.
 */

export type SendResetEmailResult = { sent: true; email: string };

/** The one Supabase auth operation this needs: trigger the recovery email. */
export type RecoveryEmailSender = (email: string) => Promise<void>;

/**
 * Trigger the standard Supabase recovery email, the identical call recovery.ts
 * makes (its template links to /auth/confirm). A refusal throws so the
 * transaction rolls back and the audit entry is never written.
 */
async function defaultSendRecoveryEmail(email: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    throw new Error(
      `admin reset email not sent (${error.code ?? error.status ?? "unknown"})`,
    );
  }
}

/**
 * Send a password-reset email to `targetUserId`'s account. Resolves the email
 * through the admin email facade; a non-admin never reaches here (assertAdmin),
 * and an unknown target or an unreadable sign-in system is a not-found/internal
 * failure that sends nothing and records nothing.
 */
export async function sendAccountResetEmail(
  actor: AdminActor,
  targetUserId: string,
  emailSource?: EmailSource,
  sendRecoveryEmail: RecoveryEmailSender = defaultSendRecoveryEmail,
): Promise<SendResetEmailResult> {
  assertAdmin(actor);
  if (!isUuid(targetUserId)) {
    throw new DomainError("not_found", "Account not found.");
  }

  return inAdminTx(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { userId: targetUserId },
      select: { userId: true },
    });
    if (!profile) throw new DomainError("not_found", "Account not found.");

    // The target's email lives in the sign-in system, not the database.
    const emails = await readEmails(emailSource);
    const email = emails?.get(targetUserId);
    if (!email) {
      // The sign-in system could not be read, or has no email for this
      // account: there is nothing to send to, so nothing is sent or recorded.
      throw new DomainError("not_found", "Account not found.");
    }

    // Send inside the transaction: a failure rolls the audit entry back, so a
    // recorded line always means a triggered send. The entry and the send
    // commit together (spec R8).
    await sendRecoveryEmail(email);

    await recordAudit(tx, actor, {
      action: "account_reset_email_sent",
      targetUserId,
    });

    return { sent: true, email };
  });
}
