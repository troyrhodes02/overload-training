import type { ReactNode } from "react";
import { AppNav } from "./app-nav";
import { AccountMenu } from "./account-menu";
import { MobileNav } from "./mobile-nav";
import { OverloadLockup } from "@/components/brand/overload-lockup";
import { Toaster } from "@/components/ui/sonner";

/**
 * The authenticated application shell: a top app bar, a content region, and the
 * primary navigation. Chrome only — it holds no data access. Later pitches
 * render their surfaces inside the content region and extend nav-items.ts.
 *
 * Phones (below md): a sticky header with the menu button that opens the
 * navigation sheet; nothing is pinned to the bottom except a screen's own
 * thumb-reach action bar. md+: the left rail and the static header, unchanged
 * (Personalization & Navigation Polish).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Left rail at md+; renders nothing below md. */}
      <AppNav />

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-2 backdrop-blur md:static md:z-auto md:h-auto md:justify-between md:gap-0 md:bg-transparent md:px-4 md:py-3 md:backdrop-blur-none">
          <MobileNav />
          <OverloadLockup size="sm" />
          <div className="ml-auto md:ml-0">
            <AccountMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-6">
          {children}
        </main>
      </div>

      {/* One toaster for the whole authenticated app (archive/undo, saves). */}
      <Toaster />
    </div>
  );
}
