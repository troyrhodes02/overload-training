import type { ReactNode } from "react";
import { requireAccount } from "@/lib/data/account";
import { getAccountAppearance } from "@/lib/accounts/appearance";
import { getTourAutoStart } from "@/lib/tour/progress";
import { getWhatsNewDialog } from "@/lib/release-notes/seen";
import { AppShell } from "@/components/shell/app-shell";
import { isAdminUserId } from "@/lib/data/admin/identity";

// This segment reads the auth session at request time, so it blocks on the
// server rather than prerendering an instant shell. Instant-navigation
// optimization is intentionally out of Foundation scope.
export const instant = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Authoritative auth gate, independent of the optimistic check in proxy.ts.
  // Resolving the acting account also ensures its profile exists (the home of
  // its timezone — the only authority for "today"; Multi-User Foundation).
  const account = await requireAccount();
  // The account's appearance preference: the shell keeps the document on it.
  // Whether the account is due its first onboarding tour (Onboarding Tour).
  // Significant release notes this account hasn't seen (What's New), read
  // alongside: the tour owns a load on which it opens by itself, so What's
  // New waits (R17).
  const [appearance, tourAutoStart, unseen] = await Promise.all([
    getAccountAppearance(account),
    getTourAutoStart(account),
    getWhatsNewDialog(account),
  ]);
  const whatsNew = tourAutoStart ? null : unseen;
  return (
    <AppShell
      appearance={appearance}
      tourAutoStart={tourAutoStart}
      whatsNew={whatsNew}
      // Admin Center & Feedback: only the allowlist decides; the shell gets a
      // boolean, never the allowlist itself.
      isAdmin={isAdminUserId(account.userId)}
    >
      {children}
    </AppShell>
  );
}
