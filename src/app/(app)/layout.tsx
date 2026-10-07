import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

// This segment reads the auth session at request time, so it blocks on the
// server rather than prerendering an instant shell. Instant-navigation
// optimization is intentionally out of Foundation scope.
export const instant = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Authoritative auth gate, independent of the optimistic check in proxy.ts.
  await requireUser();
  return <AppShell>{children}</AppShell>;
}
