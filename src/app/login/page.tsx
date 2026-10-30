import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Overload",
};

// Reads `?notice=` at request time, so it blocks rather than prerendering a
// static shell (same posture as the authenticated layout).
export const instant = false;

/** The only notices the login screen shows; anything else is ignored. */
const NOTICES: Record<string, string> = {
  deleted: "Your account was deleted.",
  "password-updated": "Password updated. Sign in with your new password.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { notice } = await searchParams;
  const message = typeof notice === "string" ? (NOTICES[notice] ?? null) : null;
  return (
    <AuthCard
      footer={
        <div className="space-y-1">
          <p>
            New to Overload?{" "}
            <Link
              href="/signup"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </p>
          <p>
            <Link
              href="/support"
              className="font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Need help?
            </Link>
          </p>
        </div>
      }
    >
      <LoginForm notice={message} />
    </AuthCard>
  );
}
