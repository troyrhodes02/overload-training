import type { Metadata } from "next";
import { OverloadLockup } from "@/components/brand/overload-lockup";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Overload",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <h1 className="flex justify-center">
          <OverloadLockup size="lg" />
        </h1>
        <div className="rounded-lg border border-border bg-card p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
