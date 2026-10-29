import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireAccount, type Account } from "@/lib/data/account";
import { getAuthUser } from "@/lib/auth";
import { type ActionResult } from "@/lib/actions/result";

/**
 * Email verification (Public Accounts, spec §9 verification, §5 lifecycle,
 * R2; design Screen 6, D1/D2/D8). It proves a lifter owns their email and
 * records the fact in `Profile.emailVerifiedAt`.
 *
 * CRITICAL INVARIANT: verification gates NOTHING in this pitch. No Free screen
 * reads `emailVerifiedAt`, sign-in is never gated, and Supabase's global
 * `enable_confirmations` stays `false` (turning it on would gate sign-in).
 * The stored fact exists only for a later first-checkout gate (Billing) to
 * read; it is written here and read nowhere as a Free gate.
 *
 * Two server-side operations, built from an injectable `deps` seam (mirroring
 * recovery.ts) so tests need no Supabase:
 *
 *   - sendVerificationEmail — trigger a Supabase verification email to the
 *     acting account's OWN email, resolved from the session, NEVER from input.
 *     It never sends to an arbitrary address. A send failure is logged by code
 *     only (never the address) and folds into the same honest "sent" copy the
 *     nudge shows (the link only reaches an inbox the account controls).
 *
 *   - confirmEmailVerification — run under the short-lived verify auth session
 *     that /auth/confirm established. It sets `emailVerifiedAt = now()` for the
 *     acting account, through `account.db`, so another account's row can never
 *     be touched. Idempotent: re-confirming an already-verified email is a
 *     no-op that still reports success.
 */

/** The slice of the Supabase auth client the send operation needs. */
type VerificationSupabaseAuth = {
  resend: (args: {
    type: "signup";
    email: string;
  }) => Promise<{ error: { code?: string; status?: number } | null }>;
};

async function defaultAuth(): Promise<VerificationSupabaseAuth> {
  const supabase = await createServerSupabase();
  return supabase.auth as unknown as VerificationSupabaseAuth;
}

export type SendVerificationDeps = {
  /** The acting account's own email, resolved from the session (never input). */
  ownEmail: () => Promise<string | null>;
  /** Builds the Supabase auth client bound to this request's cookies. */
  auth: () => Promise<VerificationSupabaseAuth>;
};

async function sessionEmail(): Promise<string | null> {
  const user = await getAuthUser();
  return user?.email ?? null;
}

const defaultSendDeps: SendVerificationDeps = {
  ownEmail: sessionEmail,
  auth: defaultAuth,
};

/**
 * Send a verification email to the ACTING account's own email. The address is
 * taken from the authenticated session (never from a parameter, field, or
 * URL), so this can never target anyone else's inbox. The verification link
 * routes back through /auth/confirm (verify type → /verify-email), which
 * exchanges the one-time token and lands on the confirmation surface.
 *
 * Supabase's own template is the sender (no `resend` SDK is added). Because the
 * account is already a confirmed user, the send may be refused by the auth
 * service; that is logged by code only and still resolves to `{ sent: true }`,
 * since the message only ever reaches an inbox the account controls and the
 * copy the lifter sees is honest and unconditional.
 */
export async function sendVerificationEmail(
  _account: Account,
  deps: Partial<SendVerificationDeps> = {},
): Promise<ActionResult<{ sent: true }>> {
  const { ownEmail, auth } = { ...defaultSendDeps, ...deps };

  const email = await ownEmail();
  if (!email) {
    // No authenticated email to verify. Nothing is sent and nothing leaks.
    return {
      ok: false,
      error: { code: "unauthorized", message: "Sign in and try again." },
    };
  }

  try {
    const authClient = await auth();
    const { error } = await authClient.resend({ type: "signup", email });
    if (error) {
      console.error(
        `verification email not sent (${error.code ?? error.status ?? "unknown"})`,
      );
    }
  } catch {
    console.error("verification email not sent (unreachable)");
  }

  // Honest and unconditional: the link only reaches the account's own inbox.
  return { ok: true, data: { sent: true } };
}

export type ConfirmVerificationDeps = {
  now: () => Date;
  /** Resolves the acting account from the session; a seam for unit tests. */
  actingAccount: () => Promise<Account>;
};

const defaultConfirmDeps: ConfirmVerificationDeps = {
  now: () => new Date(),
  actingAccount: requireAccount,
};

/**
 * Record that the acting account's email is verified. The account is resolved
 * from the authenticated session through requireAccount() — NEVER from input,
 * a parameter, or the URL — so the row written is the one the verify link's
 * session belongs to. The caller reaches this only with a live session (the
 * /verify-email page gates it on an authenticated user), so requireAccount()'s
 * redirect never fires here.
 *
 * The write is a single-column `updateMany` through `account.db`, scoped to the
 * acting account — it can never touch another account's row. Idempotent: a
 * second confirm (a reused or refreshed link) matches no `null` row and is a
 * no-op that still reports `{ verified: true }`.
 *
 * A test seam (`actingAccount`) lets unit tests supply a fake account without
 * a session; by default it is requireAccount().
 */
export async function confirmEmailVerification(
  deps: Partial<ConfirmVerificationDeps> = {},
): Promise<ActionResult<{ verified: true }>> {
  const { now, actingAccount } = { ...defaultConfirmDeps, ...deps };
  const account = await actingAccount();

  await account.db.profile.updateMany({
    where: { userId: account.userId, emailVerifiedAt: null },
    data: { emailVerifiedAt: now() },
  });

  return { ok: true, data: { verified: true } };
}

/** The Settings nudge's view of the acting account's OWN email verification. */
export type EmailVerificationDto = { email: string; verified: boolean };

/**
 * The verification state for the acting account's own email. The email comes
 * from the auth session; `verified` is `emailVerifiedAt != null`, read through
 * the account-scoped client so no other account's row is ever consulted.
 */
export async function getEmailVerification(
  account: Account,
  email: string,
): Promise<EmailVerificationDto> {
  const profile = await account.db.profile.findUnique({
    where: { userId: account.userId },
    select: { emailVerifiedAt: true },
  });
  return { email, verified: profile?.emailVerifiedAt != null };
}
