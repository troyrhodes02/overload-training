import "server-only";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth";
import { createAccountClient } from "./account-db";

/**
 * Email verification state (Public Accounts; OVE-121 / audit F-A1).
 *
 * `Profile.emailVerifiedAt` records that a lifter proved they control their
 * inbox, and it gates the first checkout. It is written in exactly ONE place:
 * `confirmEmailVerificationLink`, called by `/auth/confirm` in the same request
 * that verified the one-time token. Nothing else sets it:
 *
 *  - opening `/verify-email` never writes (it only reads, through
 *    `getOwnEmailVerificationState`);
 *  - having a signed-in session proves nothing about a link, so no session —
 *    recovery, a verification-link session reloaded later, or any other OTP
 *    session — is ever treated as proof;
 *  - recovery tokens never reach this module (`/auth/confirm` hands them to
 *    the reset flow untouched).
 *
 * This lives in the data layer because the account it writes is the one the
 * auth service returned for the verified token (not the cookie session, not
 * input), and only `src/lib/data` may build a scoped client from an auth id.
 */

/** OTP link types that prove email ownership (never `recovery`). */
export const EMAIL_VERIFICATION_OTP_TYPES: ReadonlySet<string> = new Set([
  "email",
  "signup",
  "email_change",
  // The one-time link signInWithOtp sends — the path an already-confirmed
  // account uses to complete Overload's separate email verification.
  "magiclink",
]);

type AuthUserLike = { id: string; email?: string | null };

/** The slice of the Supabase auth client this needs (a seam for tests). */
export type VerificationLinkAuth = {
  verifyOtp(args: { type: EmailOtpType; token_hash: string }): Promise<{
    data: {
      user: AuthUserLike | null;
      session: { access_token: string } | null;
    };
    error: unknown;
  }>;
  getUser(jwt: string): Promise<{
    data: { user: AuthUserLike | null };
    error: unknown;
  }>;
};

/**
 * - `invalid`: the token was missing, expired, reused, rejected, or not a
 *   verification type. Nothing was written.
 * - `not_verified`: the token verified, but the verified email did not match
 *   the account's current email (or the account could not be confirmed), so
 *   nothing was written.
 * - `verified`: the account's `emailVerifiedAt` is set.
 */
export type VerificationLinkOutcome = "invalid" | "not_verified" | "verified";

const normalizeEmail = (email: string | null | undefined): string =>
  (email ?? "").trim().toLowerCase();

/**
 * Verify an email-verification link and, only on success, record the account
 * as email-verified — all in the one request that verified the token.
 *
 *  1. `verifyOtp` on the token. Any failure is `invalid`.
 *  2. Look up, from the Auth server, the account the new session belongs to
 *     (by its access token — never the incoming cookie session). Its id must
 *     be the verified user's id and its current email must equal the email the
 *     token verified; otherwise `not_verified`.
 *  3. Set `emailVerifiedAt` for that account through its scoped client, only
 *     where it is still null (idempotent: a reused link never moves it).
 *
 * Never throws: a failure after the token verified is logged by name only and
 * reported as `not_verified`, so the lifter lands on a page that shows the
 * stored (unverified) state and can send a new link.
 */
export async function confirmEmailVerificationLink(
  auth: VerificationLinkAuth,
  link: { type: string; tokenHash: string },
  deps: { now: () => Date } = { now: () => new Date() },
): Promise<VerificationLinkOutcome> {
  if (!EMAIL_VERIFICATION_OTP_TYPES.has(link.type) || !link.tokenHash) {
    return "invalid";
  }

  let verified: AuthUserLike;
  let accessToken: string;
  try {
    const { data, error } = await auth.verifyOtp({
      type: link.type as EmailOtpType,
      token_hash: link.tokenHash,
    });
    if (error || !data?.user || !data.session?.access_token) return "invalid";
    verified = data.user;
    accessToken = data.session.access_token;
  } catch {
    return "invalid";
  }

  try {
    const { data, error } = await auth.getUser(accessToken);
    const current = data?.user;
    if (error || !current || current.id !== verified.id) return "not_verified";
    const verifiedEmail = normalizeEmail(verified.email);
    if (!verifiedEmail || verifiedEmail !== normalizeEmail(current.email)) {
      return "not_verified";
    }

    const db = createAccountClient(current.id);
    await db.profile.updateMany({
      where: { userId: current.id, emailVerifiedAt: null },
      data: { emailVerifiedAt: deps.now() },
    });
    const profile = await db.profile.findUnique({
      where: { userId: current.id },
      select: { emailVerifiedAt: true },
    });
    return profile?.emailVerifiedAt ? "verified" : "not_verified";
  } catch (error) {
    console.error(
      "email verification: could not record a verified link",
      error instanceof Error ? error.name : "unknown",
    );
    return "not_verified";
  }
}

export type OwnEmailVerificationState =
  | { state: "signed_out" }
  | { state: "verified" | "unverified"; email: string | null };

/**
 * The signed-in visitor's stored verification state, for the display-only
 * `/verify-email` page. Read-only: it never creates a profile or writes
 * anything (unlike requireAccount, which records last-active).
 */
export async function getOwnEmailVerificationState(): Promise<OwnEmailVerificationState> {
  const user = await getAuthUser();
  if (!user) return { state: "signed_out" };
  const profile = await createAccountClient(user.id).profile.findUnique({
    where: { userId: user.id },
    select: { emailVerifiedAt: true },
  });
  return {
    state: profile?.emailVerifiedAt ? "verified" : "unverified",
    email: user.email ?? null,
  };
}
