import type { Metadata } from "next";
import { getAuthUser } from "@/lib/auth";
import { supportEmail } from "@/lib/accounts/support-email";
import { SupportCard } from "@/components/auth/support-card";

export const metadata: Metadata = {
  title: "Get help — Overload",
};

/**
 * /support (Public Accounts design doc Screen 9, D5; spec §6, R9/R10).
 *
 * A public page reachable signed in or out (it is in PUBLIC_PATHS). It writes
 * NOTHING: signed-out visitors get a `mailto:` contact affordance, and
 * signed-in visitors are pointed at the existing Send feedback form (/feedback).
 * The acting user is read from the session only (never creating a profile), so
 * a signed-out request sees the signed-out card and no account work happens.
 */

// The signed-in/out branch is decided per request from the session.
export const instant = false;

export default async function SupportPage() {
  const user = await getAuthUser();
  return (
    <SupportCard signedIn={user !== null} supportAddress={supportEmail()} />
  );
}
