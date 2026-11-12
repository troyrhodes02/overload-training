import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthCard } from "@/components/auth/auth-card";
import { getOwnEmailVerificationState } from "@/lib/data/email-verification";
import {
  VerifyEmailConfirmation,
  type VerifyEmailState,
} from "./verify-email-confirmation";

export const metadata: Metadata = {
  title: "Verify your email — Overload",
};

// The visitor's auth state is checked per request.
export const instant = false;

/**
 * The landing target for a verification link (Public Accounts design Screen 6;
 * D8). /auth/confirm has already verified the one-time token — and, when it
 * was good and matched the account's email, RECORDED the verification in that
 * same request — then redirected here, plainly or with `?error=expired`.
 *
 * DISPLAY ONLY (OVE-121 / audit F-A1): this page never writes. Opening it
 * directly, signed in or not, changes nothing. It shows the stored state:
 * verified, not verified yet, or (signed out) a prompt to sign in.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { error } = await searchParams;
  const stored = await getOwnEmailVerificationState();
  const signedIn = stored.state !== "signed_out";
  const email = stored.state === "signed_out" ? null : stored.email;

  const state: VerifyEmailState =
    error === "expired"
      ? "expired"
      : stored.state === "signed_out"
        ? "signed_out"
        : stored.state;

  return (
    <AuthCard>
      <VerifyEmailConfirmation
        state={state}
        signedIn={signedIn}
        email={email}
      />
    </AuthCard>
  );
}
