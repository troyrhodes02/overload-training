import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthCard } from "@/components/auth/auth-card";
import { getAuthUser } from "@/lib/auth";
import { confirmEmailVerification } from "@/lib/accounts/verification";
import { VerifyEmailConfirmation } from "./verify-email-confirmation";

export const metadata: Metadata = {
  title: "Verify your email — Overload",
};

// The visitor's auth state is checked per request.
export const instant = false;

/**
 * The landing target for a verification link (Public Accounts design Screen 6;
 * D8). /auth/confirm has already exchanged the one-time token for a short-lived
 * session and redirected here — on success plainly, or with `?error=expired`
 * when the token was missing, expired, reused, or rejected.
 *
 * When the link was good and the visitor is signed in, this records
 * `Profile.emailVerifiedAt` for the acting account (idempotent) and confirms
 * it. Works signed out too: the card still shows, with a Sign in button, and
 * nothing is written for a visitor with no session.
 *
 * Verification gates NOTHING — reaching this page opens no feature and sign-in
 * is never blocked by it.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { error } = await searchParams;
  const user = await getAuthUser();
  const signedIn = Boolean(user);

  if (error === "expired") {
    return (
      <AuthCard>
        <VerifyEmailConfirmation
          state="expired"
          signedIn={signedIn}
          email={user?.email ?? null}
        />
      </AuthCard>
    );
  }

  // A valid link with a signed-in session records the verified state.
  // confirmEmailVerification resolves the acting account from the session
  // (requireAccount), scopes the write to it, and is idempotent. A signed-out
  // visitor (the session never landed) sees the confirmation without any
  // write, so the surface works either way (D8).
  if (user) {
    await confirmEmailVerification();
  }

  return (
    <AuthCard>
      <VerifyEmailConfirmation
        state="verified"
        signedIn={signedIn}
        email={user?.email ?? null}
      />
    </AuthCard>
  );
}
