import type { ReactNode } from "react";
import { requireAccount } from "@/lib/data/account";
import { getAccountAppearance } from "@/lib/accounts/appearance";
import { getTourAutoStart } from "@/lib/tour/progress";
import { AppShell } from "@/components/shell/app-shell";

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
  const [appearance, tourAutoStart] = await Promise.all([
    getAccountAppearance(account),
    getTourAutoStart(account),
  ]);
  return (
    <AppShell appearance={appearance} tourAutoStart={tourAutoStart}>
      {children}
    </AppShell>
  );
}
