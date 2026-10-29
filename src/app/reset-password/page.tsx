import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AuthCard } from "@/components/auth/auth-card";
import { createServerSupabase } from "@/lib/supabase/server";
import { isRecoverySessionNow } from "@/lib/accounts/recovery";
import { ResetLinkExpired } from "./link-expired";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Set a new password — Overload",
};

// The recovery auth session is checked per request.
export const instant = false;

/**
 * Reachable with the recovery auth session that /auth/confirm creates. The
 * email shown is that session's own address — never one from the URL. Opened
 * any other way (directly, expired, reused) it shows the expired-link card.
 */
export default async function ResetPasswordPage() {
  await connection();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const usable = isRecoverySessionNow(claims);
  const email = typeof claims?.email === "string" ? claims.email : "";

  return (
    <AuthCard
      footer={
        <Link
          href="/support"
          className="font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Need help?
        </Link>
      }
    >
      {usable ? <ResetPasswordForm email={email} /> : <ResetLinkExpired />}
    </AuthCard>
  );
}
