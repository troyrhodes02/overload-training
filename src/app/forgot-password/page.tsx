import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Reset your password — Overload",
};

// Reads `?email=` / `?link=` at request time (no prerendered shell).
export const instant = false;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const { email, link } = await searchParams;
  return (
    // The form owns its card: the sent state drops the footer link.
    <ForgotPasswordForm
      // The lifter's own typing, carried from the login form; display only.
      initialEmail={typeof email === "string" ? email.slice(0, 254) : ""}
      linkExpired={link === "expired"}
    />
  );
}
