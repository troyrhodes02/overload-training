import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { isSignupOpen } from "@/lib/accounts/invite";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your account — Overload",
};

// Whether signup is open is read from the server environment at request time
// (never baked in at build), so the page blocks rather than prerendering.
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
  if (!isSignupOpen()) {
    return (
      <AuthCard>
        <h1 className="text-lg font-semibold">Signup isn&apos;t open</h1>
        <p className="text-sm text-muted-foreground">
          Overload is invite-only, and signup is closed right now.
        </p>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard footer={<>Already have an account? {signInLink}</>}>
      <SignupForm />
    </AuthCard>
  );
}
