import type { ReactNode } from "react";
import { AppNav } from "./app-nav";
import { AccountMenu } from "./account-menu";
import { Toaster } from "@/components/ui/sonner";

/**
 * The authenticated application shell: a top app bar, a content region, and the
 * primary navigation. Chrome only — it holds no data access. Later pitches
 * render their surfaces inside the content region and extend AppNav.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Bottom bar on mobile, left rail at md+. */}
      <AppNav />

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-lg font-semibold">Overload</span>
          <AccountMenu />
        </header>

        {/* pb-24 keeps content clear of the fixed mobile bottom bar. */}
        <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      {/* One toaster for the whole authenticated app (archive/undo, saves). */}
      <Toaster />
    </div>
  );
}
