import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { signupMode } from "@/lib/accounts/signup-gate";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your account — Overload",
};

/**
 * What the server hands the signup form: the resolved mode and the public
 * Turnstile site key (PA2). A null key disables the widget and keeps the
 * primary button disabled (D3) — the server would reject a tokenless submit
 * anyway, so the form never falls through the human check.
 */
export type SignupViewDto = {
  mode: "invite" | "public";
  turnstileSiteKey: string | null;
};

// The signup mode is read from the server environment at request time (never
// baked in at build), so the page blocks rather than prerendering. The browser
// never learns which modes exist — it renders exactly the one state the server
// chose.
export const instant = false;

const signInLink = (
  <Link
    href="/login"
    className="font-medium text-primary underline-offset-4 hover:underline"
  >
    Sign in
  </Link>
);

export default async function SignupPage() {
  await connection();
  const mode = signupMode();
  if (mode === "closed") {
    return (
      <AuthCard>
        <h1 className="text-lg font-semibold">Signup isn&apos;t open</h1>
        <p className="text-sm text-muted-foreground">
          New accounts can&apos;t be created right now. If you already have one,
          sign in.
        </p>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </AuthCard>
    );
  }
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;
  return (
    <AuthCard
      footer={
        <div className="space-y-1">
          <p>Already have an account? {signInLink}</p>
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
      <SignupForm view={{ mode, turnstileSiteKey }} />
    </AuthCard>
  );
}
