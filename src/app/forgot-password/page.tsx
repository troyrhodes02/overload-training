import type { Metadata } from "next";
import { connection } from "next/server";
import { isTurnstileBypassEnabled } from "@/lib/accounts/turnstile-bypass";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Reset your password — Overload",
};

// Reads `?email=` / `?link=` and the Turnstile site key at request time (no
// prerendered shell).
export const instant = false;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  await connection();
  const { email, link } = await searchParams;
  // The development / Preview bypass hides the widget; the server re-decides
  // it on submit (verifyChallenge), so this grants nothing by itself.
  const challengeDisabled = isTurnstileBypassEnabled();
  const turnstileSiteKey = challengeDisabled
    ? null
    : (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null);
  return (
    // The form owns its card: the sent state drops the footer link.
    <ForgotPasswordForm
      // The lifter's own typing, carried from the login form; display only.
      initialEmail={typeof email === "string" ? email.slice(0, 254) : ""}
      linkExpired={link === "expired"}
      turnstileSiteKey={turnstileSiteKey}
      challengeDisabled={challengeDisabled}
    />
  );
}
