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
 * inAdminTx().
 *
 * ORDER — audit THEN send (review #2/#3). The admin's action is "I triggered a
 * reset for this account", and that action happened the moment the owner
 * clicked, whether or not the SMTP hand-off then succeeds. So the append-only
 * entry is written and COMMITTED first, in its own inAdminTx(); the external
 * Supabase email send happens AFTER the transaction commits. This closes two
 * problems the first shape had: (1) an un-audited send — if the send ran inside
 * the tx and then the audit write or commit failed, an email went out with no
 * record; and (2) a live network round-trip held open inside a pooled Postgres
 * transaction, which risks a statement/transaction timeout rolling back an
 * already-successful send. If the send fails, the audit entry remains (the
 * owner did trigger a reset) and this throws a DomainError so the action
 * surfaces the "Couldn't send… Try again." failure to the UI. No un-audited
 * send can occur, and no send is ever inside the DB transaction.
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

  // Resolve the target and its address, then COMMIT the audit entry, all before
  // any external send. A non-admin never reaches here (assertAdmin above); an
  // unknown target or an unreadable sign-in system is a not-found that writes
  // no entry and sends nothing.
  const email = await inAdminTx(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { userId: targetUserId },
      select: { userId: true },
    });
    if (!profile) throw new DomainError("not_found", "Account not found.");

    // The target's email lives in the sign-in system, not the database.
    const emails = await readEmails(emailSource);
    const resolved = emails?.get(targetUserId);
    if (!resolved) {
      // The sign-in system could not be read, or has no email for this
      // account: there is nothing to send to, so nothing is recorded.
      throw new DomainError("not_found", "Account not found.");
    }

    // Record the admin's action — who/what/which account/when — and commit it
    // with this transaction. The entry stands even if the send then fails: the
    // owner did trigger a reset.
    await recordAudit(tx, actor, {
      action: "account_reset_email_sent",
      targetUserId,
    });

    return resolved;
  });

  // The transaction has committed. Now perform the external send OUTSIDE any DB
  // transaction, so no network round-trip is held inside a pooled connection.
  // A failure leaves the committed audit entry in place and surfaces as a
  // failure ActionResult ("Couldn't send… Try again.") — never an un-audited
  // send, never a rolled-back record of an email that already went out.
  await sendRecoveryEmail(email);

  return { sent: true, email };
}
